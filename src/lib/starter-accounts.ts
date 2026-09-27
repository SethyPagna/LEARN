/**
 * The two accounts every new local database starts with (README, "Default
 * Login"). Public demo values: change them before real learner data.
 * Shared by the seed and by local browser checks, so they never drift apart.
 */
export const starterAccounts = [
  {
    id: "user_admin",
    username: "admin",
    email: "admin@learn.local",
    name: "LEARN Admin",
    password: "Admin123456!",
    role: "admin",
  },
  {
    id: "user_learner",
    username: "learner",
    email: "learner@learn.local",
    name: "Demo Learner",
    password: "Learn123456!",
    role: "learner",
  },
] as const
