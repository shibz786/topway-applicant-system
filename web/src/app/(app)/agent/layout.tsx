import { ContractClosureModal } from "@/components/agent-portal/contract-closure-modal";

// Shared by both /agent (My Applications) and /agent/databank — the
// one-time contract-closure popup belongs to the agent's session, not to
// either specific page, so it lives here instead of being duplicated (or
// missed) on one of the two.
export default function AgentLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <ContractClosureModal />
      {children}
    </>
  );
}
