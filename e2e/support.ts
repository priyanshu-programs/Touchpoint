export const owner = {
  name: "Priya Owner",
  email: "owner@example.com",
  password: "correct-horse-battery-staple",
};

// Sign-in is rate limited, so every file after first run reuses the session saved there.
// Files run in name order: 01 creates the session and 99 ends it.
export const OWNER_SESSION = "e2e/.auth/owner.json";
