// Service SDKs among a package's dependencies (finding of 25 Oct): Rentgen lists the URL literals of the code, and a
// payment gateway that talks to Stripe only through the `stripe` SDK read `Talks to: no hosts found in the code`. A
// curated, partial list: an SDK here talks to one named service. Isomorphic: no Node APIs.

/** npm name or `@scope/*` -> the service the package calls. Curated; a dependency not listed here is not named. */
const SERVICE_SDKS: readonly (readonly [pattern: string, service: string])[] = [
  ['stripe', 'Stripe'],
  ['@stripe/*', 'Stripe'],
  ['@aws-sdk/*', 'AWS'],
  ['@ai-sdk/amazon-bedrock', 'Amazon Bedrock'],
  ['@shopify/*', 'Shopify'],
  ['firebase-admin', 'Firebase'],
  ['expo-server-sdk', 'Expo push'],
  ['@parse/node-apn', 'Apple Push Notification service'],
  ['resend', 'Resend'],
  ['svix', 'Svix'],
  ['openai', 'OpenAI'],
  ['@ai-sdk/openai', 'OpenAI'],
  ['@anthropic-ai/sdk', 'Anthropic'],
  ['@ai-sdk/anthropic', 'Anthropic'],
  ['@ai-sdk/azure', 'Azure OpenAI'],
  ['@ai-sdk/google', 'Google AI'],
  ['@ai-sdk/mistral', 'Mistral'],
  ['@ai-sdk/cohere', 'Cohere'],
  ['meilisearch', 'Meilisearch'],
  ['algoliasearch', 'Algolia'],
  ['twilio', 'Twilio'],
  ['@sendgrid/*', 'SendGrid'],
  ['@slack/*', 'Slack'],
  ['discord.js', 'Discord'],
  ['@paypal/*', 'PayPal'],
  ['@mollie/api-client', 'Mollie'],
  ['googleapis', 'Google APIs'],
  ['@google-cloud/*', 'Google Cloud'],
  ['@azure/*', 'Azure'],
]

/** The service an SDK package calls, or null when the package is not a known service SDK. */
export function sdkService(name: string): string | null {
  for (const [pattern, service] of SERVICE_SDKS)
    if (pattern.endsWith('/*') ? name.startsWith(pattern.slice(0, -1)) : name === pattern) return service
  return null
}

/** Known service SDKs among dependency names, sorted, first 20. */
export function serviceSdks(dependencies: readonly string[]): string[] {
  return [...new Set(dependencies.filter((d) => sdkService(d) !== null))].sort().slice(0, 20)
}

/** The services of SDK names in first-seen order, unknown names left out. */
export function servicesOf(sdks: readonly string[]): string[] {
  return [...new Set(sdks.map(sdkService).filter((s): s is string => s !== null))]
}

/**
 * The SDK half of a `Talks to` sentence: `Stripe through its SDK (stripe, @stripe/stripe-js)`, `OpenAI and Anthropic
 * through their SDKs (@ai-sdk/openai, @ai-sdk/anthropic)`. Null without a known SDK.
 */
export function sdkPhrase(sdks: readonly string[]): string | null {
  const known = sdks.filter((s) => sdkService(s) !== null)
  const services = servicesOf(known)
  if (services.length === 0) return null
  const names =
    services.length === 1
      ? (services[0] as string)
      : `${services.slice(0, -1).join(', ')} and ${services[services.length - 1] as string}`
  return `${names} through ${services.length === 1 ? 'its SDK' : 'their SDKs'} (${known.join(', ')})`
}

/**
 * `Talks to:` of a package (the card, the page): the hosts of its URL literals, then the services of its SDKs. Without
 * either, `no URL found in the code`: Rentgen reads URL literals, so that is all it can say.
 */
export function talksToText(
  hosts: readonly string[],
  sdks: readonly string[],
  listHosts: (h: string[]) => string,
): string {
  const sdk = sdkPhrase(sdks)
  if (hosts.length > 0) return sdk ? `${listHosts([...hosts])}; ${sdk}` : listHosts([...hosts])
  return sdk ? `no URL in the code; ${sdk}` : 'no URL found in the code'
}
