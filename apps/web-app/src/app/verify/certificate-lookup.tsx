'use client';

import { FormEvent, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { QrCode, Search, X } from 'lucide-react';
import { Button } from '@/components/ui/primitives/button';
import { Input } from '@/components/ui/primitives/input';
import { routeForScannedText, verifyPathFor } from '@/lib/verify/verify-route';
import { cameraSupported, scanQrFromCamera } from '@/lib/verify/qr-camera';

const TYPE_INSTEAD = 'พิมพ์เลขที่ใบรับรองในช่องด้านบนแทน';

function cameraFailureMessage(error: unknown): string {
  const name = error instanceof DOMException ? error.name : '';
  if (name === 'NotAllowedError' || name === 'SecurityError') {
    return `ไม่ได้รับอนุญาตให้ใช้กล้อง อนุญาตกล้องในการตั้งค่าเบราว์เซอร์ หรือ${TYPE_INSTEAD}`;
  }
  if (name === 'NotFoundError' || name === 'OverconstrainedError') {
    return `ไม่พบกล้องบนอุปกรณ์นี้ ${TYPE_INSTEAD}`;
  }
  return `เปิดกล้องไม่ได้ ${TYPE_INSTEAD}`;
}

export function CertificateLookup() {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const [number, setNumber] = useState('');
  const [inputError, setInputError] = useState<string | undefined>();
  const [scanning, setScanning] = useState(false);
  const [scanError, setScanError] = useState<string | null>(null);
  const [elsewhere, setElsewhere] = useState<{ host: string; path: string } | null>(null);

  useEffect(() => {
    if (!scanning || !videoRef.current) return;
    const controller = new AbortController();
    scanQrFromCamera(videoRef.current, controller.signal)
      .then((text) => {
        const route = routeForScannedText(text, window.location.host);
        if (route.kind === 'path' && route.otherHost === null) {
          router.push(route.path);
          return;
        }
        setScanning(false);
        if (route.kind === 'path' && route.otherHost !== null) {
          setElsewhere({ host: route.otherHost, path: route.path });
          return;
        }
        setScanError('QR นี้ไม่ใช่ QR ของใบรับรองหรือสินค้า GACP');
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        setScanError(cameraFailureMessage(error));
        setScanning(false);
        inputRef.current?.focus();
      });
    return () => controller.abort();
  }, [scanning, router]);

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const path = verifyPathFor(number);
    if (!path) {
      setInputError('กรุณาพิมพ์เลขที่ใบรับรอง');
      inputRef.current?.focus();
      return;
    }
    setInputError(undefined);
    router.push(path);
  };

  const startScan = () => {
    setScanError(null);
    setElsewhere(null);
    if (!cameraSupported()) {
      setScanError(`เบราว์เซอร์นี้เปิดกล้องไม่ได้ ${TYPE_INSTEAD}`);
      inputRef.current?.focus();
      return;
    }
    setScanning(true);
  };

  return (
    <div className="space-y-5">
      <form onSubmit={submit} noValidate className="space-y-3" aria-label="ตรวจสอบใบรับรองด้วยเลขที่">
        <Input
          ref={inputRef}
          id="certificate-number"
          name="certificateNumber"
          label="เลขที่ใบรับรอง"
          description="พิมพ์เลขที่/ปี พ.ศ. ตามที่พิมพ์บนใบรับรอง · เลขแบบเดิม เช่น TH-GACP 1/2569 หรือ GACP-TH-2568-A3F7B2 ก็ใช้ได้"
          placeholder="เลขที่/ปี พ.ศ."
          autoComplete="off"
          autoCapitalize="characters"
          spellCheck={false}
          value={number}
          error={inputError}
          onChange={(event) => setNumber(event.target.value)}
          className="h-12 text-base"
        />
        <Button type="submit" size="md" className="w-full" leftSection={<Search className="h-5 w-5" aria-hidden="true" />}>
          ตรวจสอบ
        </Button>
      </form>

      <div className="flex items-center gap-3 text-xs text-muted-foreground" aria-hidden="true">
        <span className="h-px flex-1 bg-border" />
        หรือ
        <span className="h-px flex-1 bg-border" />
      </div>

      {scanning ? (
        <div className="space-y-3">
          {/* The live preview needs a fixed dark backdrop in both themes so the frame edges stay visible. */}
          <div className="overflow-hidden rounded-lg bg-black">
            <video ref={videoRef} muted playsInline aria-label="ภาพจากกล้องสำหรับสแกน QR" className="aspect-square w-full object-cover" />
          </div>
          <p role="status" className="text-center text-sm text-foreground">
            หันกล้องไปที่ QR บนใบรับรองหรือบนสินค้า
          </p>
          <Button
            type="button"
            variant="outline"
            size="md"
            className="w-full"
            onClick={() => setScanning(false)}
            leftSection={<X className="h-5 w-5" aria-hidden="true" />}
          >
            ปิดกล้อง
          </Button>
        </div>
      ) : (
        <Button
          type="button"
          variant="outline"
          size="md"
          className="w-full"
          onClick={startScan}
          leftSection={<QrCode className="h-5 w-5" aria-hidden="true" />}
        >
          สแกน QR
        </Button>
      )}

      {scanError ? (
        <p role="alert" className="rounded-lg bg-amber-50 px-4 py-3 text-sm text-amber-900">
          {scanError}
        </p>
      ) : null}

      {elsewhere ? (
        <div role="alert" className="space-y-3 rounded-lg bg-amber-50 px-4 py-3 text-sm text-amber-900">
          <p>
            QR นี้ชี้ไปที่ <span className="break-all font-bold">{elsewhere.host}</span> ซึ่งไม่ใช่เว็บไซต์นี้ อาจเป็น QR ปลอม
          </p>
          <Button type="button" variant="outline" size="sm" onClick={() => router.push(elsewhere.path)}>
            ตรวจสอบบนเว็บไซต์นี้
          </Button>
        </div>
      ) : null}
    </div>
  );
}
