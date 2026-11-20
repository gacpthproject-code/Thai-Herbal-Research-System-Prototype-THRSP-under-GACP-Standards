import * as React from 'react';
import { describe, expect, it, afterEach, beforeEach } from '@jest/globals';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';

declare global {

    var IS_REACT_ACT_ENVIRONMENT: boolean | undefined;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

import { applicantStatus } from '../health-dashboard-stage';
import { ACTION_META } from '@/app/health/applications/[id]/application-detail-page-config';
import { NotCertifiedCard } from '@/app/health/applications/[id]/not-certified-card';
import { buildOfficerComments, buildTimeline } from '@/app/health/applications/[id]/application-detail-page-helpers';

const NAMES_AN_OFFICIAL_BODY_DEADLINE_OR_CHANNEL =
    /ผู้อนุมัติ|อธิบดี|ผู้อำนวยการ|รัฐมนตรี|เลขาธิการ|คณะกรรมการ|ศาล|กรม|กระทรวง|โทร|อีเมล|@|https?:\/\/|www\.|ภายใน\s*\d+\s*วัน/;

const named = (texts: Array<string | undefined>) =>
    texts.filter((text): text is string => typeof text === 'string' && NAMES_AN_OFFICIAL_BODY_DEADLINE_OR_CHANNEL.test(text));

describe('order 91, until DTAM answers who decides and how to appeal: refusal copy on the applicant side names no deciding official and no appeal body, deadline or channel', () => {
    let container: HTMLDivElement;
    let root: Root;
    beforeEach(() => {
        container = document.createElement('div');
        document.body.appendChild(container);
        root = createRoot(container);
    });
    afterEach(() => {
        act(() => { root.unmount(); });
        container.remove();
    });

    it('a file the inspector did not pass is "under consideration", with no word on who decides it', () => {
        const view = applicantStatus('AUDIT_NOT_PASSED');
        expect(named([view.label, view.description, view.nextAction])).toEqual([]);
        expect(view.description).toContain('แจ้งผลให้ทราบ');
    });

    it('a refused application, its action card and its not-certified card name no official and no channel', () => {
        const view = applicantStatus('REJECTED');
        const meta = ACTION_META.NOT_CERTIFIED;
        act(() => {
            root.render(<NotCertifiedCard refusal={{ reasonLabel: 'เหตุจากรายการ', consideration: 'ข้อพิจารณาของคำสั่ง', decidedAt: '2026-10-14T09:00:00.000Z' }} />);
        });
        expect(named([view.label, view.description, view.nextAction, meta.title, meta.hint, meta.buttonLabel, container.textContent || ''])).toEqual([]);
    });

    it('the timeline and the officer comments of a refused application do not name who decided it', () => {
        const history = {
            applicationId: 'a', status: 'REJECTED',
            workflowHistory: [{ index: 1, action: 'WORKFLOW_TRANSITION', toStatus: 'REJECTED', actorRole: 'certificate_approver', comment: 'ไม่ให้การรับรอง: เหตุจากรายการ', repeatCount: 1 }],
            comments: [{ id: 'c1', authorRole: 'certificate_approver', commentText: 'ไม่ให้การรับรอง: เหตุจากรายการ', createdAt: '2026-10-20T12:27:00Z' }],
        };
        const timeline = buildTimeline(history);
        const comments = buildOfficerComments(history);
        expect(named([...timeline.map((item) => item.actor), ...comments.map((comment) => comment.author)])).toEqual([]);
        expect([timeline.length, comments.length]).toEqual([1, 2]);
    });
});
