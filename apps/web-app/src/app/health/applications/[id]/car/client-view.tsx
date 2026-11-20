'use client';

import { Container } from '@/components/ui/layout-utils';
import { LoadingOverlay } from '@/components/ui/data-components';
import { Button } from '@/components/ui/primitives/button';
import { Alert } from '@/components/ui/alert';
import { Textarea } from '@/components/ui/textarea';
import { useCallback, useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';

import { IconAlertCircle, IconCheck, IconFileText, IconUpload } from '@tabler/icons-react';
import { notifications } from '@/lib/notifications';
import { apiClient } from '@/lib/api/api-client';
import { useLanguage } from '@/lib/i18n/language-context';
import {
  CAR_MAX_FILES, refuseBeforeUpload, removeCarFile, sendCarRound, uploadCarFile, type StagedCarFile,
} from '@/lib/services/car-file-upload';
import {
  CAR_PAGE_COPY_TH, sendBlocker, type CarDefect, type CarFileItem,
} from '@/lib/services/car-round';
import { refusedFields, submitGateRefusalTh, type RefusedField } from '@/lib/services/application-requirements';

interface Application {
  id: string;
  applicationNumber: string;
  status: string;
  carRound?: { defects: CarDefect[]; stagedFiles: StagedCarFile[] } | null;
}

const hasThai = (text: unknown): text is string => typeof text === 'string' && /[฀-๿]/.test(text);
const sizeMb = (bytes: number) => `${(bytes / 1024 / 1024).toFixed(1)} MB`;

function stagedItems(staged: StagedCarFile[] = []): CarFileItem[] {
  return staged.map((doc) => ({
    key: doc.id, findingNo: Number(doc.findingNo) || 1, name: doc.originalName, size: doc.size,
    state: 'uploaded', serverId: doc.id, error: null, refused: false, deletesAt: doc.deletesAt ?? null,
  }));
}

export default function CARUploadPage() {
  const params = useParams();
  const router = useRouter();
  const applicationId = params.id as string;
  const { dict } = useLanguage();
  const car = dict.health.car;

  const [application, setApplication] = useState<Application | null>(null);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [items, setItems] = useState<CarFileItem[]>([]);
  const [files, setFiles] = useState<Record<string, File>>({});
  const [notice, setNotice] = useState<string | null>(null);
  const [notes, setNotes] = useState('');
  const [sending, setSending] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [refused, setRefused] = useState<RefusedField[]>([]);

  const fetchApplication = useCallback(async () => {
    try {
      setLoading(true);
      setFetchError(null);
      const result = await apiClient.get<Application>(`/applications/${applicationId}`);
      if (!result.success) throw new Error('Failed to fetch');
      setApplication(result.data || null);
      setItems(stagedItems(result.data?.carRound?.stagedFiles));
    } catch {
      setFetchError(car.errorFetch);
    } finally {
      setLoading(false);
    }
  }, [applicationId, car.errorFetch]);

  useEffect(() => { void fetchApplication(); }, [fetchApplication]);

  const patch = (key: string, change: Partial<CarFileItem>) =>
    setItems((list) => list.map((item) => (item.key === key ? { ...item, ...change } : item)));

  const uploading = items.some((item) => item.state === 'uploading');
  const next = items.find((item) => item.state === 'waiting');

  useEffect(() => {
    if (uploading || !next) { return; }
    const file = files[next.key];
    if (!file) { patch(next.key, { state: 'failed', error: CAR_PAGE_COPY_TH.pickAgain, refused: true }); return; }
    patch(next.key, { state: 'uploading', error: null });
    void uploadCarFile({ applicationId, file, findingNo: next.findingNo }).then(({ file: stored, error }) => {
      if (stored) {
        setItems((list) => (list.some((item) => item.key !== next.key && item.serverId === stored.id)
          ? list.filter((item) => item.key !== next.key)
          : list.map((item) => (item.key === next.key
            ? { ...item, state: 'uploaded', serverId: stored.id, error: null, deletesAt: stored.deletesAt ?? null }
            : item))));
      } else {
        patch(next.key, { state: 'failed', error });
      }
    });
  }, [uploading, next, files, applicationId]);

  const addFiles = async (defect: CarDefect, picked: File[]) => {
    setNotice(null);
    const room = CAR_MAX_FILES - items.filter((item) => !item.refused).length;
    if (picked.length > room) { setNotice(CAR_PAGE_COPY_TH.overLimit(Math.max(room, 0))); }
    const added: CarFileItem[] = [];
    const addedFiles: Record<string, File> = {};
    for (const file of picked.slice(0, Math.max(room, 0))) {
      const key = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
      const refusal = await refuseBeforeUpload(file);
      added.push({
        key, findingNo: defect.no, name: file.name, size: file.size,
        state: refusal ? 'failed' : 'waiting', serverId: null, error: refusal, refused: Boolean(refusal), deletesAt: null,
      });
      addedFiles[key] = file;
    }
    setFiles((current) => ({ ...current, ...addedFiles }));
    setItems((list) => [...list, ...added]);
  };

  const removeItem = async (item: CarFileItem) => {
    if (item.serverId) {
      patch(item.key, { state: 'uploading', error: null });
      const result = await removeCarFile(applicationId, item.serverId);
      if (!result.success) {
        patch(item.key, { state: 'uploaded', error: hasThai(result.error) ? result.error : CAR_PAGE_COPY_TH.removeFailed });
        return;
      }
    }
    setItems((list) => list.filter((entry) => entry.key !== item.key));
  };

  const handleSend = async () => {
    setSending(true);
    setUploadError(null);
    setRefused([]);
    const result = await sendCarRound(
      applicationId,
      items.map((item) => ({ id: item.serverId as string, findingNo: item.findingNo })),
      notes,
    );
    setSending(false);
    if (!result.success) {
      const fields = refusedFields(result.meta);
      if (fields.length > 0) { setRefused(fields); return; }
      const said = submitGateRefusalTh(result.errorCode ?? result.code, result.meta) ?? result.meta?.messageTh;
      setUploadError(hasThai(said) ? said : hasThai(result.error) ? result.error : car.errorUpload);
      return;
    }
    notifications.show({ title: car.successTitle, message: car.successBody, color: 'green', icon: <IconCheck size={16} /> });
    router.push(`/health/applications/${applicationId}`);
  };

  if (loading) {
    return (
      <Container size="full" data-testid="car-loading">
        <LoadingOverlay visible />
      </Container>
    );
  }

  if (fetchError) {
    return (
      <Container size="full">
        <Alert data-testid="car-fetch-error" icon={<IconAlertCircle size={16} />} title={car.errorTitle} color="red">
          <p className="mb-2 text-sm">{fetchError}</p>
          <Button variant="default" size="sm" onClick={() => void fetchApplication()}>{car.retry}</Button>
        </Alert>
      </Container>
    );
  }

  if (!application) {
    return (
      <Container size="full">
        <Alert data-testid="car-not-found" icon={<IconAlertCircle size={16} />} title={car.notFoundTitle} color="red">
          {car.notFoundBody}
        </Alert>
      </Container>
    );
  }

  if (application.status !== 'CAR_PENDING' || !application.carRound) {
    return (
      <Container size="full">
        <Alert icon={<IconAlertCircle size={16} />} title={car.notRequiredTitle} color="blue">{car.notRequiredBody}</Alert>
      </Container>
    );
  }

  const defects = application.carRound.defects;
  const blocker = sendBlocker(items);
  const counted = items.filter((item) => !item.refused).length;

  return (
    <Container size="full">
      <div className="flex flex-col gap-5">
        <div>
          <h2 className="flex items-center gap-2 text-xl font-semibold text-foreground">
            <IconFileText size={28} aria-hidden="true" />
            {car.title}
          </h2>
          <p className="text-sm text-muted-foreground">{car.subtitle.replace('{appNumber}', application.applicationNumber)}</p>
        </div>

        <Alert icon={<IconAlertCircle size={16} />} color="yellow" title={car.yellowTitle}>
          <p className="text-sm">{CAR_PAGE_COPY_TH.howTo}</p>
        </Alert>

        <p data-testid="car-file-count" className="text-sm text-muted-foreground">{CAR_PAGE_COPY_TH.count(counted)}</p>
        {notice && <Alert data-testid="car-notice" color="yellow">{notice}</Alert>}

        {defects.map((defect) => {
          const mine = items.filter((item) => item.findingNo === defect.no);
          return (
            <section key={defect.no} data-testid={`car-defect-${defect.no}`} className="rounded-lg border border-border bg-card p-4">
              <h3 className="font-semibold text-foreground">{CAR_PAGE_COPY_TH.defectHeading(defect.no)}</h3>
              {defect.nonConformity && <p className="mt-1 text-sm text-foreground">{defect.nonConformity}</p>}
              {defect.correctiveAction && (
                <p className="mt-1 text-sm text-muted-foreground">{CAR_PAGE_COPY_TH.correctiveAction}{defect.correctiveAction}</p>
              )}
              <ul className="mt-3 space-y-2">
                {mine.map((item) => (
                  <li key={item.key} data-testid="car-file-row" data-state={item.state} className="rounded-md border border-border p-2 text-sm">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="min-w-0 break-all">{item.name} <span className="text-muted-foreground">({sizeMb(item.size)})</span></span>
                      <span className={item.state === 'failed' ? 'font-medium text-destructive' : 'font-medium text-foreground'}>
                        {CAR_PAGE_COPY_TH.state[item.state]}
                      </span>
                    </div>
                    {item.state === 'uploaded' && item.deletesAt && (
                      <p data-testid="car-file-deletes-at" className="mt-1 text-xs text-muted-foreground">{CAR_PAGE_COPY_TH.deletesAt(item.deletesAt)}</p>
                    )}
                    {item.error && <p role="alert" className="mt-1 text-destructive">{item.error}</p>}
                    <div className="mt-2 flex flex-wrap gap-2">
                      {item.state === 'failed' && !item.refused && (
                        <Button size="sm" variant="default" className="min-h-[44px]" onClick={() => patch(item.key, { state: 'waiting', error: null })}>
                          {CAR_PAGE_COPY_TH.retry}
                        </Button>
                      )}
                      {item.state !== 'uploading' && (
                        <Button size="sm" variant="default" className="min-h-[44px]" onClick={() => void removeItem(item)}>
                          {CAR_PAGE_COPY_TH.remove}
                        </Button>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
              <label className="mt-3 inline-flex min-h-[44px] cursor-pointer items-center gap-2 rounded-md border border-border px-3 text-sm font-medium text-foreground">
                <IconUpload size={16} aria-hidden="true" />
                {CAR_PAGE_COPY_TH.addFiles}
                <input
                  type="file"
                  multiple
                  accept=".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png"
                  className="sr-only"
                  data-testid={`car-file-input-${defect.no}`}
                  disabled={counted >= CAR_MAX_FILES}
                  onChange={(event) => {
                    const picked = Array.from(event.currentTarget.files || []);
                    event.currentTarget.value = '';
                    void addFiles(defect, picked);
                  }}
                />
              </label>
              {mine.length === 0 && <p className="mt-2 text-xs text-muted-foreground">{CAR_PAGE_COPY_TH.noFileYet}</p>}
            </section>
          );
        })}

        <p className="text-xs text-muted-foreground">{CAR_PAGE_COPY_TH.rules}</p>

        <Textarea label={car.notesLabel} placeholder={car.notesPlaceholder} value={notes} onChange={(e) => setNotes(e.currentTarget.value)} rows={4} />

        {uploadError && (
          <Alert data-testid="car-upload-error" icon={<IconAlertCircle size={16} />} title={car.errorTitle} color="red">{uploadError}</Alert>
        )}
        {refused.length > 0 && (
          <section data-testid="car-refused-fields" role="alert" className="space-y-3 rounded-lg border border-destructive/30 bg-destructive/5 p-4">
            <h2 className="text-sm font-medium text-foreground">{CAR_PAGE_COPY_TH.refusedTitle}</h2>
            <p className="text-xs text-muted-foreground">{CAR_PAGE_COPY_TH.refusedIntro}</p>
            <ul className="list-disc space-y-1 pl-5 text-sm text-foreground">
              {refused.map((field, index) => <li key={`${field.key}-${index}`}>{field.message}</li>)}
            </ul>
            <Button asChild variant="outline" className="min-h-[44px]">
              <a href={`/health/applications/${applicationId}/edit`}>{CAR_PAGE_COPY_TH.editAnswersCta}</a>
            </Button>
          </section>
        )}
        {blocker && <p data-testid="car-send-blocker" className="text-sm text-muted-foreground">{blocker}</p>}

        <div className="flex flex-wrap items-center gap-2">
          <Button variant="default" className="min-h-[44px]" onClick={() => router.push(`/health/applications/${applicationId}`)}>{car.cancel}</Button>
          <Button
            data-testid="car-send"
            className="min-h-[44px]"
            onClick={() => void handleSend()}
            loading={sending}
            disabled={Boolean(blocker) || sending}
            leftSection={<IconCheck size={16} />}
          >
            {car.submit}
          </Button>
        </div>

        <Alert icon={<IconAlertCircle size={16} />} color="blue"><p className="text-sm">{car.footerNote}</p></Alert>
      </div>
    </Container>
  );
}
