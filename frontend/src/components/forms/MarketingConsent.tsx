import { MARKETING_CONSENT_TEXT } from "@/lib/marketing/consent";

export function MarketingConsent() {
  return (
    <label className="lead-form__consent lead-form__marketing-consent">
      <input name="marketing_consent" type="checkbox" />
      <span>{MARKETING_CONSENT_TEXT}</span>
    </label>
  );
}
