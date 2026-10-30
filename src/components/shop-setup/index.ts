/**
 * The shop forms that onboarding and Settings share: the details, the policies, the
 * notification choices and the PayPal connection, plus the checks and ids they use.
 */
export { ShopProfileFields } from "./shop-profile-fields";
export { ShopPolicyFields } from "./shop-policy-fields";
export { NotificationFields } from "./notification-fields";
export { PayPalConnect, EnvironmentChip, ENVIRONMENT_LABEL, featureOn } from "./paypal-connect";
export {
  checkPolicies,
  checkProfile,
  fieldId,
  fieldsUnder,
  focusFirstError,
  POLICY_FIELDS,
  PROFILE_FIELDS,
  shortKey,
  without,
  type ProfileErrors,
} from "./fields";
