import type { StageKind, StageTask } from "@/db/schema";

export type StarterStage = {
  name: string;
  description: string | null;
  kind: StageKind;
  slaDays: number | null;
  checklist: { label: string; required: boolean }[];
  defaultTasks: StageTask[];
};

export type StarterTemplate = {
  key: string;
  name: string;
  description: string;
  stages: readonly StarterStage[];
};

const end = (name: string, kind: StageKind, tasks: StageTask[] = []) => ({
  name,
  description: null,
  kind,
  slaDays: null,
  checklist: [],
  defaultTasks: tasks,
});

// Workflows offered in one click. A starter is added by its key from this list,
// so what it becomes is decided here and not by the request. Once added it is the
// owner's own and can be changed like any other.
export const STARTER_TEMPLATES: readonly StarterTemplate[] = [
  {
    key: "prospecting",
    name: "Prospecting",
    description: "From a first look at someone worth approaching to a yes or a no.",
    stages: [
      {
        name: "Identified",
        description: "Worth approaching, not yet contacted.",
        kind: "normal",
        slaDays: 7,
        checklist: [{ label: "Right person found", required: true }],
        defaultTasks: [
          {
            title: "Research and find the right person",
            offsetDays: 0,
            priority: "normal",
          },
        ],
      },
      {
        name: "Contacted",
        description: "First message sent, waiting for a reply.",
        kind: "normal",
        slaDays: 14,
        checklist: [{ label: "Reply received", required: true }],
        defaultTasks: [
          {
            title: "Follow up if there is no reply",
            offsetDays: 3,
            priority: "normal",
          },
        ],
      },
      {
        name: "In conversation",
        description: "Talking about what they need.",
        kind: "normal",
        slaDays: 21,
        checklist: [
          { label: "Need understood", required: true },
          { label: "Budget discussed", required: false },
          { label: "Decision maker known", required: false },
        ],
        defaultTasks: [
          { title: "Book a discovery call", offsetDays: 2, priority: "normal" },
        ],
      },
      {
        name: "Proposal sent",
        description: "They have the proposal and are deciding.",
        kind: "normal",
        slaDays: 14,
        checklist: [{ label: "Proposal sent", required: true }],
        defaultTasks: [
          {
            title: "Follow up on the proposal",
            offsetDays: 5,
            priority: "high",
          },
        ],
      },
      end("Won", "won", [
        {
          title: "Say thank you and agree the next steps",
          offsetDays: 1,
          priority: "normal",
        },
      ]),
      end("Lost", "lost"),
    ],
  },
  {
    key: "website_project",
    name: "Website Project",
    description: "Delivering a website, from kickoff to handover.",
    stages: [
      {
        name: "Kickoff",
        description: "Agreeing what is being built and getting what is needed.",
        kind: "normal",
        slaDays: 7,
        checklist: [
          { label: "Brief agreed", required: true },
          { label: "Access and assets received", required: false },
        ],
        defaultTasks: [
          { title: "Hold the kickoff call", offsetDays: 2, priority: "high" },
        ],
      },
      {
        name: "Design",
        description: null,
        kind: "normal",
        slaDays: 21,
        checklist: [{ label: "Designs approved", required: true }],
        defaultTasks: [
          { title: "Share the first designs", offsetDays: 7, priority: "normal" },
        ],
      },
      {
        name: "Build",
        description: null,
        kind: "normal",
        slaDays: 30,
        checklist: [{ label: "Content in place", required: false }],
        defaultTasks: [
          { title: "Share a preview link", offsetDays: 14, priority: "normal" },
        ],
      },
      {
        name: "Review",
        description: "The client looks it over and asks for changes.",
        kind: "normal",
        slaDays: 14,
        checklist: [{ label: "Feedback addressed", required: true }],
        defaultTasks: [
          { title: "Collect feedback", offsetDays: 3, priority: "normal" },
        ],
      },
      {
        name: "Launch",
        description: null,
        kind: "normal",
        slaDays: 7,
        checklist: [{ label: "Site live", required: true }],
        defaultTasks: [
          { title: "Run the go-live checks", offsetDays: 0, priority: "high" },
        ],
      },
      end("Delivered", "done", [
        {
          title: "Hand over logins and documents",
          offsetDays: 2,
          priority: "normal",
        },
      ]),
    ],
  },
];
