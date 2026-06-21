"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export default function IntegrationsSettingsPage() {
  const [result, setResult] = useState<string>("");
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  const webhookUrl = `${appUrl}/api/webhooks/zapier`;

  async function sendTestPayload() {
    setResult("Sending...");
    const response = await fetch("/api/integrations/zapier/test", { method: "POST" });
    const json = (await response.json()) as { data: { caseNumber?: string } | null; error: string | null };
    if (!response.ok) {
      setResult(json.error ?? "Failed");
      return;
    }
    setResult(`Success: ${json.data?.caseNumber ?? "created"}`);
  }

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold sm:text-2xl">Integrations</h1>
      <Card>
        <CardHeader>
          <CardTitle>Zapier Webhook</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>Webhook URL</Label>
            <Input readOnly value={webhookUrl} />
          </div>
          <div className="space-y-2 text-sm">
            <p className="font-medium">Required Headers</p>
            <p>
              <code>x-webhook-secret</code>: HMAC-SHA256 of raw body using <code>WEBHOOK_SECRET</code>
            </p>
            <p>
              or <code>Authorization: Bearer cms_live_...</code>
            </p>
          </div>
          <Button onClick={sendTestPayload}>Send Test Payload</Button>
          {result ? <p className="text-sm text-muted-foreground">{result}</p> : null}
        </CardContent>
      </Card>
    </div>
  );
}
