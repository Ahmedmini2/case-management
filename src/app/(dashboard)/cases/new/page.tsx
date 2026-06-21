import { CaseForm } from "@/components/cases/CaseForm";

export default function NewCasePage() {
  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold sm:text-2xl">Create Case</h1>
      <CaseForm />
    </div>
  );
}
