"use server";

import { google } from "googleapis";

type ActionState = {
  returnPath: string;
  uid: string;
  email?: string;
  formData: any;
};

export async function getGoogleDriveAuthUrl(state: ActionState) {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const appUrl = process.env.NEXT_PUBLIC_APP_URL;

  if (!clientId || !clientSecret) throw new Error("Missing GOOGLE_CLIENT_ID/GOOGLE_CLIENT_SECRET");
  if (!appUrl) throw new Error("Missing NEXT_PUBLIC_APP_URL");

  const redirectUri = `${appUrl}/api/auth/callback/google`;

  const oauth2Client = new google.auth.OAuth2(clientId, clientSecret, redirectUri);

  const scopes = [
    "https://www.googleapis.com/auth/drive.file",
    "openid",
    "email",
    "profile",
  ];

  const encodedState = Buffer.from(JSON.stringify(state)).toString("base64");

  const url = oauth2Client.generateAuthUrl({
    access_type: "offline",
    prompt: "consent",
    scope: scopes,
    state: encodedState,
  });

  return { url };
}
