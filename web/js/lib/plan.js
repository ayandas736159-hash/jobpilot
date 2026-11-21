import { chooseChecks, chooseOption } from "./choices.js";
import { valueForPurpose } from "./profile.js";

/** Decide what to put in one detected field. Rules only — no model call. */
export function proposeField(field, profile) {
  if (field.kind === "file") {
    return {
      include: false,
      value: "",
      optionId: "",
      optionIds: [],
      reason: "Attach the resume file yourself. JobPilot cannot upload files."
    };
  }
  if (field.kind === "single") {
    const choice = chooseOption(field.label, field.options, profile);
    const option = choice.index >= 0 ? field.options[choice.index] : null;
    return {
      include: Boolean(option),
      value: "",
      optionId: option ? option.id : "",
      optionIds: [],
      choice,
      reason: choice.reason
    };
  }
  if (field.kind === "multi") {
    const choice = chooseChecks(field.label, field.options, profile);
    return {
      include: choice.indices.length > 0,
      value: "",
      optionId: "",
      optionIds: choice.indices.map((index) => field.options[index].id),
      choice,
      reason: choice.reason
    };
  }
  if (field.openEnded) {
    return {
      include: true,
      value: "",
      optionId: "",
      optionIds: [],
      openEnded: true,
      reason: "Written from your profile and this job description after you generate it."
    };
  }
  const value = valueForPurpose(field.purpose, profile);
  return {
    include: Boolean(value),
    value,
    optionId: "",
    optionIds: [],
    reason: value ? "Filled from your saved profile." : "No matching fact in the profile, so this stays blank."
  };
}

export function planFromProposals(proposals) {
  const plan = [];
  (proposals || []).forEach((item) => {
    if (!item.include) return;
    if (item.optionId) {
      plan.push({ id: item.field.id, optionId: item.optionId, label: item.field.label });
      return;
    }
    if (item.optionIds && item.optionIds.length) {
      plan.push({ id: item.field.id, optionIds: item.optionIds, label: item.field.label });
      return;
    }
    if (typeof item.value === "string" && item.value.trim()) {
      plan.push({ id: item.field.id, value: item.value, label: item.field.label });
    }
  });
  return plan;
}
