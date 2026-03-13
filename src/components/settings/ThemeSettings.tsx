
"use client";

import { useTheme } from "@/hooks/useTheme";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { Check } from "lucide-react";

const themes = [
  { name: "Default Light", themeValue: "theme-pure-white", primaryValue: "primary-pure-white", color: "hsl(0, 0%, 100%)" },
  { name: "Soft Green", themeValue: "theme-soft-green", primaryValue: "primary-soft-green", color: "hsl(95, 35%, 45%)" },
  { name: "Dim Soft Green", themeValue: "theme-dim-soft-green", primaryValue: "primary-dim-soft-green", color: "hsl(140, 70%, 50%)" },
  { name: "Soft Blue", themeValue: "theme-soft-blue", primaryValue: "primary-soft-blue", color: "hsl(210, 90%, 50%)" },
  { name: "Sky Blue", themeValue: "theme-sky-blue", primaryValue: "primary-sky-blue", color: "hsl(199, 89%, 50%)" },
  { name: "Soft Yellow", themeValue: "theme-soft-yellow", primaryValue: "primary-soft-yellow", color: "hsl(45, 95%, 55%)" },
  { name: "Soft Pink", themeValue: "theme-soft-pink", primaryValue: "primary-soft-pink", color: "hsl(350, 80%, 60%)" },
  { name: "Colorfull", themeValue: "theme-colorfull", primaryValue: "primary-colorfull", color: "hsl(270, 70%, 55%)" },
];

export function ThemeSettings() {
  const { theme, setTheme, primaryColor, setPrimaryColor } = useTheme();

  return (
    <div className="space-y-8">
      <Card>
        <CardHeader>
          <CardTitle>Background Theme</CardTitle>
          <CardDescription>
            Choose a color theme for the application background.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-4">
            {themes.map((t) => (
              <div
                key={t.themeValue}
                onClick={() => setTheme(t.themeValue as any)}
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
                    style={{ backgroundColor: t.color }}
                  ></div>
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
                    style={{ backgroundColor: t.color }}
                  ></div>
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
