import { boardRouter } from "./routers/board";
import { cardRouter } from "./routers/card";
import { checklistRouter } from "./routers/checklist";
import { feedbackRouter } from "./routers/feedback";
import { importRouter } from "./routers/import";
import { integrationRouter } from "./routers/integration";
import { labelRouter } from "./routers/label";
import { listRouter } from "./routers/list";
import { memberRouter } from "./routers/member";
import { pageRouter } from "./routers/page";
import { userRouter } from "./routers/user";
import { workspaceRouter } from "./routers/workspace";
import { createTRPCRouter } from "./trpc";

export const appRouter = createTRPCRouter({
  board: boardRouter,
  card: cardRouter,
  checklist: checklistRouter,
  feedback: feedbackRouter,
  label: labelRouter,
  list: listRouter,
  member: memberRouter,
  page: pageRouter,
  import: importRouter,
  user: userRouter,
  workspace: workspaceRouter,
  integration: integrationRouter,
});

export type AppRouter = typeof appRouter;
