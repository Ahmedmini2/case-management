"use client";

import { useState } from "react";
import { ActionSelector } from "@/components/automations/ActionSelector";
import { TriggerSelector } from "@/components/automations/TriggerSelector";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function AutomationBuilder() {
  const [name, setName] = useState("");
  const [triggerType, setTriggerType] = useState("CASE_CREATED");
  const [actionType, setActionType] = useState("SEND_EMAIL");
  const [targetCaseId, setTargetCaseId] = useState("");
  const [result, setResult] = useState("");

  async function createAutomation() {
    const body =
      actionType === "SEND_EMAIL"
        ? {
            name,
            trigger: { type: triggerType, conditions: [] },
            actions: [{ type: actionType, config: { to: ["demo.agent@local.test"], subject: "Automation alert" } }],
          }
        : {
            name,
            trigger: { type: triggerType, conditions: [] },
            actions: [{ type: actionType, config: {} }],
          };

    const response = await fetch("/api/automations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    setResult(response.ok ? "Automation saved." : "Failed to save automation.");
  }

  async function dryRun() {
    const response = await fetch("/api/automations/test", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ caseId: targetCaseId, triggerType }),
    });
    const json = (await response.json()) as { data?: { matched?: number; executed?: number } };
    setResult(
      response.ok
        ? `Dry-run done. Matched: ${json.data?.matched ?? 0}, executed: ${json.data?.executed ?? 0}`
        : "Dry-run failed.",
    );
  }

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      <Card>
        <CardHeader>
          <CardTitle>Trigger</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <Label>When a case is...</Label>
          <TriggerSelector value={triggerType} onChange={setTriggerType} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Conditions</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm text-muted-foreground">
          Condition groups are enabled in backend; UI condition cards can be expanded next.
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Actions</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <ActionSelector value={actionType} onChange={setActionType} />
        </CardContent>
      </Card>

      <Card className="sm:col-span-2 lg:col-span-3">
        <CardHeader>
          <CardTitle>Create and Test</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="space-y-2">
            <Label>Automation name</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Auto-prioritize urgent cases" />
          </div>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <Button onClick={createAutomation} className="w-full sm:w-auto">Save Automation</Button>
            <Input
              value={targetCaseId}
              onChange={(e) => setTargetCaseId(e.target.value)}
              placeholder="Case ID for dry run"
              className="w-full sm:flex-1"
            />
            <Button variant="outline" onClick={dryRun} className="w-full sm:w-auto">
              Dry Run
            </Button>
          </div>
          {result ? <p className="text-sm text-muted-foreground">{result}</p> : null}
        </CardContent>
      </Card>
    </div>
  );
}
