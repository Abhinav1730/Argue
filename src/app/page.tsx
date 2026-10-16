import { RelayApp } from "../components/relay-app";
import { serverConfig } from "../server-config";
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ invite?: string }>;
}) {
  const { invite } = await searchParams;
  const config = serverConfig();
  const providerDescription =
    "OpenRouter · " +
    config.model +
    " · " +
    config.providers.join(", ") +
    " · provider data collection: " +
    (process.env.OPENROUTER_DATA_COLLECTION === "allow"
      ? "allowed"
      : "denied") +
    ". " +
    (config.key ? "Server key configured." : "No server key configured.");
  return (
    <RelayApp
      initialInvite={typeof invite === "string" ? invite : ""}
      providerDescription={providerDescription}
    />
  );
}
