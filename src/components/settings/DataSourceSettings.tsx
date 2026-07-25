"use client";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { useDataSource } from "@/contexts/DataSourceContext";
import { Server, Cloud } from "lucide-react";

/** 3001 so local API doesn't conflict with Next.js on 3000. */
const DEFAULT_PORT = 3001;

function getPortFromUrl(url: string): number {
  try {
    const u = new URL(url.startsWith("http") ? url : `http://${url}`);
    const p = u.port ? parseInt(u.port, 10) : DEFAULT_PORT;
    return Number.isFinite(p) && p > 0 && p < 65536 ? p : DEFAULT_PORT;
  } catch {
    return DEFAULT_PORT;
  }
}

function buildUrlFromPort(port: number): string {
  const p = Number.isFinite(port) && port > 0 && port < 65536 ? port : DEFAULT_PORT;
  return `http://127.0.0.1:${p}`;
}

export function DataSourceSettings() {
  const { mode, setMode, localApiBaseUrl, setLocalApiBaseUrl } = useDataSource();
  const port = getPortFromUrl(localApiBaseUrl);

  const handlePortChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value.replace(/\D/g, "");
    const num = raw === "" ? DEFAULT_PORT : Math.min(65535, Math.max(1, parseInt(raw, 10) || DEFAULT_PORT));
    setLocalApiBaseUrl(buildUrlFromPort(num));
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Data source</CardTitle>
        <CardDescription>
          Data kahan save hoga: Local server (SQLite) ya Online (Firebase). Local choose karte waqt server port bhi yahan se change kar sakte ho.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="space-y-3">
          <Label>Save data</Label>
          <div className="flex flex-wrap gap-4">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="radio"
                name="dataSource"
                checked={mode === "firebase"}
                onChange={() => setMode("firebase")}
                className="h-4 w-4"
              />
              <Cloud className="h-4 w-4 text-muted-foreground" />
              <span>Online (Firebase)</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="radio"
                name="dataSource"
                checked={mode === "local"}
                onChange={() => setMode("local")}
                className="h-4 w-4"
              />
              <Server className="h-4 w-4 text-muted-foreground" />
              <span>Local (server)</span>
            </label>
          </div>
        </div>

        {mode === "local" && (
          <>
            <div className="space-y-2">
              <Label htmlFor="local-server-port">Server port</Label>
              <Input
                id="local-server-port"
                type="number"
                min={1}
                max={65535}
                value={port}
                onChange={handlePortChange}
                placeholder="3001"
              />
              <p className="text-xs text-muted-foreground">
                Local API server ka port (default 3001, kyunki Next.js 3000 pe chal raha hota hai). Server: <code className="bg-muted px-1 rounded">cd server && LOCAL_API_PORT=3001 npm start</code>
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="local-server-url">Server URL (optional)</Label>
              <Input
                id="local-server-url"
                type="url"
                value={localApiBaseUrl}
                onChange={(e) => setLocalApiBaseUrl(e.target.value.trim() || buildUrlFromPort(DEFAULT_PORT))}
                placeholder="http://127.0.0.1:3001"
              />
              <p className="text-xs text-muted-foreground">
                Full base URL agar alag host/port use karna ho (port change upar se bhi ho jata hai).
              </p>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
