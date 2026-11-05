// Appraisal workflow per structure, mirroring the stage list of the original SEE KPI
// (Appraisal > Filter > Status). Each assignment has one current stage per structure.
// actor: who may perform the action
//   owner     = the employee being appraised (or the data owner of a corporate scorecard)
//   evaluator = the chief / assessor in the ACTION TO chain, or HR with assignment edit right
//   admin     = HR / admin with assignment edit right

export const KPI_STAGES = [
  { code: 'APPROVE_ITEM', th: 'อนุมัติหัวข้อ', en: 'Approve Item', input: true },
  { code: 'REJECT_ITEM', th: 'ทบทวนหัวข้อ', en: 'Reject Item', input: false },
  { code: 'SAVE_DRAFT_ACTUAL', th: 'บันทึกร่างผลการประเมิน', en: 'Save Draft Actual', input: true },
  { code: 'REVIEW_ACTUAL', th: 'ส่งอนุมัติผลการประเมิน', en: 'Review Actual', input: false },
  { code: 'APPROVE_ACTUAL', th: 'อนุมัติผลการประเมิน', en: 'Approve Actual', input: false },
  { code: 'REJECT_ACTUAL', th: 'ไม่อนุมัติผลการประเมิน', en: 'Reject Actual', input: true },
  { code: 'ADMIN_APPROVE_ACTUAL', th: 'แอดมินอนุมัติผลการประเมิน', en: 'Admin Approve Actual', input: false },
  { code: 'ADMIN_REJECT_ACTUAL', th: 'แอดมินปฏิเสธผลการประเมิน', en: 'Admin Reject Actual', input: true },
  { code: 'ADMIN_REJECT_ITEM', th: 'แอดมินขอแก้ไขหัวข้อ', en: 'Admin Reject Item', input: false },
  { code: 'RE_WORK', th: 'ขอปรับปรุงผลการประเมิน', en: 'Re-Work', input: true },
  { code: 'END_TO_VERTICAL', th: 'ปิดการประเมินผล', en: 'End to Vertical', input: false },
  { code: 'END_TO_HORIZONTAL', th: 'ส่งต่อ Horizontal Director', en: 'End to Horizontal Director', input: false },
];

export const COMPETENCY_STAGES = [
  { code: 'APPRAISAL', th: 'รอการประเมิน', en: 'Appraisal', input: true },
  { code: 'SAVE_DRAFT_APPRAISAL', th: 'บันทึกร่างผลการประเมิน', en: 'Save Draft Appraisal', input: true },
  { code: 'SUBMIT', th: 'ส่งอนุมัติผลการประเมิน', en: 'Submit', input: false },
  { code: 'APPROVE', th: 'อนุมัติผลการประเมิน', en: 'Approve', input: false },
  { code: 'REJECT', th: 'ไม่อนุมัติผลการประเมิน', en: 'Reject', input: true },
  { code: 'ADMIN_REJECT_ITEM', th: 'แอดมินขอแก้ไขหัวข้อ', en: 'Admin Reject Item', input: false },
  { code: 'RE_WORK', th: 'ขอปรับปรุงผลการประเมิน', en: 'Re-Work', input: true },
  { code: 'END_TO_VERTICAL', th: 'ปิดการประเมินผล', en: 'End to Vertical', input: false },
  { code: 'END_TO_HORIZONTAL', th: 'ส่งต่อ Horizontal Director', en: 'End to Horizontal Director', input: false },
];

// from -> [{ to, actor }]
const KPI_FLOW = {
  REJECT_ITEM: [{ to: 'APPROVE_ITEM', actor: 'evaluator' }],
  ADMIN_REJECT_ITEM: [{ to: 'APPROVE_ITEM', actor: 'evaluator' }],
  APPROVE_ITEM: [
    { to: 'SAVE_DRAFT_ACTUAL', actor: 'owner' }, { to: 'REVIEW_ACTUAL', actor: 'owner' },
    { to: 'REJECT_ITEM', actor: 'owner' }, { to: 'ADMIN_REJECT_ITEM', actor: 'admin' },
  ],
  SAVE_DRAFT_ACTUAL: [
    { to: 'SAVE_DRAFT_ACTUAL', actor: 'owner' }, { to: 'REVIEW_ACTUAL', actor: 'owner' },
    { to: 'REJECT_ITEM', actor: 'owner' }, { to: 'ADMIN_REJECT_ITEM', actor: 'admin' },
  ],
  REVIEW_ACTUAL: [{ to: 'APPROVE_ACTUAL', actor: 'evaluator' }, { to: 'REJECT_ACTUAL', actor: 'evaluator' }],
  REJECT_ACTUAL: [{ to: 'SAVE_DRAFT_ACTUAL', actor: 'owner' }, { to: 'REVIEW_ACTUAL', actor: 'owner' }],
  APPROVE_ACTUAL: [
    { to: 'ADMIN_APPROVE_ACTUAL', actor: 'admin' }, { to: 'ADMIN_REJECT_ACTUAL', actor: 'admin' }, { to: 'RE_WORK', actor: 'evaluator' },
  ],
  ADMIN_REJECT_ACTUAL: [{ to: 'SAVE_DRAFT_ACTUAL', actor: 'owner' }, { to: 'REVIEW_ACTUAL', actor: 'owner' }],
  RE_WORK: [{ to: 'SAVE_DRAFT_ACTUAL', actor: 'owner' }, { to: 'REVIEW_ACTUAL', actor: 'owner' }],
  ADMIN_APPROVE_ACTUAL: [{ to: 'END_TO_VERTICAL', actor: 'admin' }, { to: 'RE_WORK', actor: 'admin' }],
  END_TO_VERTICAL: [{ to: 'END_TO_HORIZONTAL', actor: 'admin' }, { to: 'RE_WORK', actor: 'admin' }],
  END_TO_HORIZONTAL: [],
};
const COMP_FLOW = {
  APPRAISAL: [{ to: 'SAVE_DRAFT_APPRAISAL', actor: 'evaluator' }, { to: 'SUBMIT', actor: 'evaluator' }],
  SAVE_DRAFT_APPRAISAL: [{ to: 'SAVE_DRAFT_APPRAISAL', actor: 'evaluator' }, { to: 'SUBMIT', actor: 'evaluator' }],
  SUBMIT: [{ to: 'APPROVE', actor: 'admin' }, { to: 'REJECT', actor: 'admin' }],
  REJECT: [{ to: 'SAVE_DRAFT_APPRAISAL', actor: 'evaluator' }, { to: 'SUBMIT', actor: 'evaluator' }],
  APPROVE: [{ to: 'END_TO_VERTICAL', actor: 'admin' }, { to: 'RE_WORK', actor: 'admin' }, { to: 'ADMIN_REJECT_ITEM', actor: 'admin' }],
  ADMIN_REJECT_ITEM: [{ to: 'APPRAISAL', actor: 'evaluator' }],
  RE_WORK: [{ to: 'SAVE_DRAFT_APPRAISAL', actor: 'evaluator' }, { to: 'SUBMIT', actor: 'evaluator' }],
  END_TO_VERTICAL: [{ to: 'END_TO_HORIZONTAL', actor: 'admin' }, { to: 'RE_WORK', actor: 'admin' }],
  END_TO_HORIZONTAL: [],
};

export const isCompetency = (structureType) => structureType === 'Quality';
export const stagesFor = (structureType) => (isCompetency(structureType) ? COMPETENCY_STAGES : KPI_STAGES);
export const firstStage = (structureType) => (isCompetency(structureType) ? 'APPRAISAL' : 'APPROVE_ITEM');
export const stageInfo = (structureType, code) => stagesFor(structureType).find((s) => s.code === code) ?? { code, th: code, en: code, input: false };

/** Actions available from `stage` for a user who plays the given roles ({ owner, evaluator, admin }). */
export function allowedActions(structureType, stage, roles) {
  const flow = isCompetency(structureType) ? COMP_FLOW : KPI_FLOW;
  return (flow[stage] ?? [])
    .filter((t) => roles.admin || roles[t.actor])
    .map((t) => ({ ...t, ...stageInfo(structureType, t.to), to: t.to }));
}

export function canTransition(structureType, from, to, roles) {
  return allowedActions(structureType, from, roles).some((a) => a.to === to);
}

/** Whether actual values may be entered at this stage (by its owner / evaluator). */
export const canInput = (structureType, stage) => stageInfo(structureType, stage).input;
