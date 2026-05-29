
"use client";

import type { CSSProperties } from "react";
import { useTheme } from "@/hooks/useTheme";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { Check } from "lucide-react";
import { LIGHT_THEME_DISPLAY_NAME, PRO_THEME_DISPLAY_NAME } from "@/lib/proTheme";

const themes = [
  {
    name: PRO_THEME_DISPLAY_NAME,
    themeValue: "theme-pro",
    primaryValue: "primary-pro",
    color: "linear-gradient(90deg, #ecfdf5, #e0f2fe, #ede9fe, #fffbeb, #ffe4e6)",
  },
  {
    name: LIGHT_THEME_DISPLAY_NAME,
    themeValue: "theme-pure-white",
    primaryValue: "primary-pure-white",
    color: "hsl(0, 0%, 100%)",
  },
  { name: "Soft Green", themeValue: "theme-soft-green", primaryValue: "primary-soft-green", color: "hsl(95, 35%, 45%)" },
  { name: "Dim Soft Green", themeValue: "theme-dim-soft-green", primaryValue: "primary-dim-soft-green", color: "hsl(140, 70%, 50%)" },
  { name: "Soft Blue", themeValue: "theme-soft-blue", primaryValue: "primary-soft-blue", color: "hsl(210, 90%, 50%)" },
  { name: "Sky Blue", themeValue: "theme-sky-blue", primaryValue: "primary-sky-blue", color: "hsl(199, 89%, 50%)" },
  { name: "Soft Yellow", themeValue: "theme-soft-yellow", primaryValue: "primary-soft-yellow", color: "hsl(45, 95%, 55%)" },
  { name: "Soft Pink", themeValue: "theme-soft-pink", primaryValue: "primary-soft-pink", color: "hsl(350, 80%, 60%)" },
  { name: "Colorfull", themeValue: "theme-colorfull", primaryValue: "primary-colorfull", color: "hsl(270, 70%, 55%)" },
];

function themeSwatchStyle(color: string): CSSProperties {
  return color.startsWith("linear-gradient") ? { background: color } : { backgroundColor: color };
}

/** `localOnlyHint`: shared user — theme pehle se localStorage me; sirf is browser/device par. */
export function ThemeSettings({ localOnlyHint }: { localOnlyHint?: boolean }) {
  const { theme, setTheme, primaryColor, setPrimaryColor } = useTheme();

  return (
    <div className="space-y-8">
      <Card>
        <CardHeader>
          <CardTitle>Background Theme</CardTitle>
          <CardDescription>
            Choose a color theme for the application background.
            {localOnlyHint ? (
              <span className="mt-2 block text-amber-700 dark:text-amber-400">
                Company settings are managed by the owner — theme changes here stay only on this device for you.
              </span>
            ) : null}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-4">
            {themes.map((t) => (
              <div
                key={t.themeValue}
                onClick={() => {
                  setTheme(t.themeValue as any);
                  setPrimaryColor(t.primaryValue as any);
                }}
                className={cn(
                  "cursor-pointer rounded-lg border-2 p-2 flex items-center justify-between",
                  theme === t.themeValue
                    ? "border-primary"
                    : "border-transparent hover:border-border"
                )}
              >
                <div className="flex items-center gap-4">
                  <div
                    className="h-8 w-8 rounded-full border"
                    style={themeSwatchStyle(t.color)}
                  />
                  <span className="font-medium">{t.name}</span>
                </div>
                {theme === t.themeValue && (
                  <Check className="w-6 h-6 text-primary" />
                )}
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Button & Accent Color</CardTitle>
          <CardDescription>
            Choose the primary color for buttons and highlights.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-4">
            {themes.map((t) => (
              <div
                key={t.primaryValue}
                onClick={() => setPrimaryColor(t.primaryValue as any)}
                className={cn(
                  "cursor-pointer rounded-lg border-2 p-2 flex items-center justify-between",
                  primaryColor === t.primaryValue
                    ? "border-primary"
                    : "border-transparent hover:border-border"
                )}
              >
                <div className="flex items-center gap-4">
                  <div
                    className="h-8 w-8 rounded-full border"
                    style={themeSwatchStyle(t.color)}
                  />
                  <span className="font-medium">{t.name}</span>
                </div>
                {primaryColor === t.primaryValue && (
                  <Check className="w-6 h-6 text-primary" />
                )}
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
