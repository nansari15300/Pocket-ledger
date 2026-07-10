"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { isLocalCompanyId, localAuthLogin, setLocalAuthToken } from "@/lib/localApiClient";
import { localAuthLoginClientOnly } from "@/lib/localCompanyUsers";
import { useAuth } from "@/hooks/useAuth";
import { useDataSource } from "@/contexts/DataSourceContext";
import { Loader2 } from "lucide-react";

type Props = {
  companyId: string;
  companyName?: string;
  onSuccess: () => void;
};

export function LocalLoginForm({ companyId, companyName, onSuccess }: Props) {
  const { user } = useAuth();
  const { localApiBaseUrl } = useDataSource();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (!username.trim() || !password) {
      setError("Username aur password likhein.");
      return;
    }
    setLoading(true);
    try {
      // Local company: SQLite doc me `localCompanyUsers` — bina Node server ke login (server path baad me optional).
      const { token, user: localUser } = isLocalCompanyId(companyId)
        ? await localAuthLoginClientOnly(companyId, username.trim(), password, {
            uid: user?.uid,
            email: user?.email,
          })
        : await localAuthLogin(localApiBaseUrl, companyId, username.trim(), password);
      setLocalAuthToken(companyId, token, localUser);
      onSuccess();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Login fail.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-[60vh] flex items-center justify-center p-4">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>
            {companyName ? `Login to ${companyName}` : "Login to this company"}
          </CardTitle>
          <CardDescription>
            Is company mein login karne ke liye username aur password daalein.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="local-username">Username</Label>
              <Input
                id="local-username"
                type="text"
                autoComplete="username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="Username"
                disabled={loading}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="local-password">Password</Label>
              <Input
                id="local-password"
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Password"
                disabled={loading}
              />
            </div>
            {error && (
              <p className="text-sm text-destructive">{error}</p>
            )}
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Login"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
