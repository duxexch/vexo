/**
 * OAuth Provider Definitions — loaded from shared provider registry.
 */
import {
    listOAuthProviderDefinitions,
    type SocialProviderDefinition,
} from "@shared/social-providers.config";
import { registerProvider, type NormalizedProfile } from "./oauth-engine";

type Normalizer = (data: Record<string, unknown>) => NormalizedProfile;

const providerNormalizers: Partial<Record<string, Normalizer>> = {
    google: (data: Record<string, unknown>): NormalizedProfile => ({
        id: String(data.id || data.sub || ""),
        email: data.email as string | undefined,
        emailVerified: data.verified_email === true,
        displayName: (data.name || data.given_name) as string | undefined,
        avatar: data.picture as string | undefined,
        raw: data,
    }),

    facebook: (data: Record<string, unknown>): NormalizedProfile => ({
        id: String(data.id || ""),
        email: data.email as string | undefined,
        emailVerified: data.verified === true || data.is_verified === true,
        displayName: data.name as string | undefined,
        avatar: ((data.picture as Record<string, unknown>)?.data as Record<string, unknown>)?.url as string | undefined,
        raw: data,
    }),

    apple: (data: Record<string, unknown>): NormalizedProfile => {
        const nameObj = data.name as Record<string, unknown> | undefined;
        return {
            id: String(data.sub || data.id || ""),
            email: data.email as string | undefined,
            emailVerified: data.email_verified === true || data.email_verified === "true",
            displayName: nameObj
                ? `${(nameObj.firstName as string) || ""} ${(nameObj.lastName as string) || ""}`.trim()
                : undefined,
            avatar: undefined,
            raw: data,
        };
    },

    twitter: (data: Record<string, unknown>): NormalizedProfile => {
        const user = (data.data || data) as Record<string, unknown>;
        return {
            id: String(user.id || ""),
            email: undefined,
            displayName: (user.name || user.username) as string | undefined,
            avatar: ((user.profile_image_url as string) || "").replace("_normal", "") || undefined,
            raw: data,
        };
    },

    discord: (data: Record<string, unknown>): NormalizedProfile => ({
        id: String(data.id || ""),
        email: data.email as string | undefined,
        emailVerified: data.verified === true,
        displayName: (data.global_name || data.username) as string | undefined,
        avatar: data.avatar
            ? `https://cdn.discordapp.com/avatars/${data.id}/${data.avatar}.png`
            : undefined,
        raw: data,
    }),

    github: (data: Record<string, unknown>): NormalizedProfile => ({
        id: String(data.id || ""),
        email: data.email as string | undefined,
        emailVerified: undefined,
        displayName: (data.name || data.login) as string | undefined,
        avatar: data.avatar_url as string | undefined,
        raw: data,
    }),

    linkedin: (data: Record<string, unknown>): NormalizedProfile => ({
        id: String(data.sub || data.id || ""),
        email: data.email as string | undefined,
        emailVerified: true,
        displayName: (data.name as string)
            || `${(data.given_name as string) || ""} ${(data.family_name as string) || ""}`.trim()
            || undefined,
        avatar: data.picture as string | undefined,
        raw: data,
    }),
};

function registerSharedProvider(provider: SocialProviderDefinition) {
    if (!provider.oauth) {
        return;
    }

    const normalizer = providerNormalizers[provider.name];
    if (!normalizer) {
        return;
    }

    registerProvider(
        {
            name: provider.name,
            authorizationUrl: provider.oauth.authorizationUrl,
            tokenUrl: provider.oauth.tokenUrl,
            userInfoUrl: provider.oauth.userInfoUrl,
            scopes: [...provider.oauth.scopes],
            supportsPKCE: provider.oauth.supportsPKCE,
            credentialsInBody: provider.oauth.credentialsInBody,
            tokenHeaders: provider.oauth.tokenHeaders,
        },
        normalizer,
    );
}

for (const provider of listOAuthProviderDefinitions()) {
    registerSharedProvider(provider);
}
