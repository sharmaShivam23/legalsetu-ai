"use client";

// Connects the site to Flagsmith so a visitor is split between button versions.
// Safe by design: with no NEXT_PUBLIC_FLAGSMITH_ENVIRONMENT_KEY it renders the
// page untouched, and every experiment falls back to "control".

import flagsmith from "@flagsmith/flagsmith";
import { FlagsmithProvider } from "@flagsmith/flagsmith/react";
import { useState, type ReactNode } from "react";

const ENV_KEY = process.env.NEXT_PUBLIC_FLAGSMITH_ENVIRONMENT_KEY;

// One stable id per visitor, so each person always sees the same version.
function visitorId() {
  try {
    let id = localStorage.getItem("verdict_visitor");
    if (!id) {
      id = "web-" + crypto.randomUUID();
      localStorage.setItem("verdict_visitor", id);
    }
    return id;
  } catch {
    return "web-anonymous";
  }
}

export default function ExperimentProvider({ children }: { children: ReactNode }) {
  const [id] = useState(visitorId);
  if (!ENV_KEY) return <>{children}</>;
  return (
    <FlagsmithProvider
      flagsmith={flagsmith}
      options={{ environmentID: ENV_KEY, identity: id, enableEvents: true }}
    >
      {children}
    </FlagsmithProvider>
  );
}
