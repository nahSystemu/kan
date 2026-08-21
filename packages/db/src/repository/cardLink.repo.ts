import { and, asc, eq, inArray, isNull, max, or, sql } from "drizzle-orm";

import type { dbClient } from "@kan/db/client";
import type { CardLinkType } from "@kan/db/schema";
import { cardLinks, lists } from "@kan/db/schema";
import { generateUID } from "@kan/shared/utils";

const linkedCardColumns = {
  columns: {
    id: true,
    publicId: true,
    title: true,
    cardNumber: true,
    dueDate: true,
    priority: true,
    archivedAt: true,
  },
  with: {
    list: {
      columns: {
        publicId: true,
        name: true,
        index: true,
        boardId: true,
      },
      with: {
        board: {
          columns: {
            publicId: true,
            name: true,
          },
          with: {
            workspace: {
              columns: { publicId: true, cardPrefix: true },
            },
          },
        },
      },
    },
    members: {
      with: {
        member: {
          columns: { publicId: true, email: true, deletedAt: true },
          with: {
            user: {
              columns: { name: true, email: true, image: true },
            },
          },
        },
      },
    },
  },
} as const;

/**
 * A card counts as done once it sits in the last list of its own board, which is
 * the board's conventional "completed" column.
 */
const getLastListIndexByBoardIds = async (
  db: dbClient,
  boardIds: number[],
): Promise<Map<number, number>> => {
  if (boardIds.length === 0) return new Map();

  const rows = await db
    .select({ boardId: lists.boardId, lastIndex: max(lists.index) })
    .from(lists)
    .where(and(inArray(lists.boardId, boardIds), isNull(lists.deletedAt)))
    .groupBy(lists.boardId);

  return new Map(
    rows
      .filter(
        (row): row is { boardId: number; lastIndex: number } =>
          row.lastIndex !== null,
      )
      .map((row) => [row.boardId, row.lastIndex]),
  );
};

export const getByCardId = async (db: dbClient, cardId: number) => {
  const links = await db.query.cardLinks.findMany({
    where: or(
      eq(cardLinks.sourceCardId, cardId),
      eq(cardLinks.targetCardId, cardId),
    ),
    orderBy: [asc(cardLinks.createdAt)],
    with: {
      source: linkedCardColumns,
      target: linkedCardColumns,
    },
  });

  const linkedCards = links.map((link) =>
    link.sourceCardId === cardId ? link.target : link.source,
  );

  const lastListIndexByBoardId = await getLastListIndexByBoardIds(db, [
    ...new Set(linkedCards.map((card) => card.list.boardId)),
  ]);

  return links.map((link) => {
    const isOutgoing = link.sourceCardId === cardId;
    const card = isOutgoing ? link.target : link.source;

    return {
      publicId: link.publicId,
      type: link.type,
      direction: isOutgoing ? ("outgoing" as const) : ("incoming" as const),
      isCompleted:
        lastListIndexByBoardId.get(card.list.boardId) === card.list.index,
      card: {
        publicId: card.publicId,
        title: card.title,
        cardNumber: card.cardNumber,
        dueDate: card.dueDate,
        priority: card.priority,
        isArchived: card.archivedAt !== null,
        cardPrefix: card.list.board.workspace.cardPrefix,
        list: { publicId: card.list.publicId, name: card.list.name },
        board: {
          publicId: card.list.board.publicId,
          name: card.list.board.name,
        },
        members: card.members
          .map((entry) => entry.member)
          .filter((member) => member.deletedAt === null)
          .map((member) => ({
            publicId: member.publicId,
            email: member.email,
            user: member.user,
          })),
      },
    };
  });
};

export const getByPublicId = async (db: dbClient, linkPublicId: string) => {
  return db.query.cardLinks.findFirst({
    columns: {
      id: true,
      publicId: true,
      type: true,
      sourceCardId: true,
      targetCardId: true,
    },
    where: eq(cardLinks.publicId, linkPublicId),
  });
};

/**
 * Adding a subtask link is rejected when the prospective child is already an
 * ancestor of the parent, otherwise the subtask tree could loop forever.
 */
export const wouldCreateSubtaskCycle = async (
  db: dbClient,
  args: { parentCardId: number; childCardId: number },
) => {
  const result = await db.execute<{ ancestorId: string }>(sql`
    WITH RECURSIVE ancestors AS (
      SELECT "sourceCardId" AS "ancestorId"
      FROM "card_link"
      WHERE "targetCardId" = ${args.parentCardId} AND "type" = 'subtask'
      UNION
      SELECT cl."sourceCardId"
      FROM "card_link" cl
      JOIN ancestors a ON cl."targetCardId" = a."ancestorId"
      WHERE cl."type" = 'subtask'
    )
    SELECT "ancestorId" FROM ancestors WHERE "ancestorId" = ${args.childCardId} LIMIT 1;
  `);

  return result.rows.length > 0;
};

export const create = async (
  db: dbClient,
  args: {
    type: CardLinkType;
    sourceCardId: number;
    targetCardId: number;
    createdBy: string;
  },
) => {
  const [result] = await db
    .insert(cardLinks)
    .values({
      publicId: generateUID(),
      type: args.type,
      sourceCardId: args.sourceCardId,
      targetCardId: args.targetCardId,
      createdBy: args.createdBy,
    })
    .returning({
      id: cardLinks.id,
      publicId: cardLinks.publicId,
    });

  if (!result) throw new Error("Unable to create card link");

  return result;
};

export const hardDelete = async (db: dbClient, linkId: number) => {
  const [result] = await db
    .delete(cardLinks)
    .where(eq(cardLinks.id, linkId))
    .returning({ id: cardLinks.id });

  return result ?? null;
};

export const exists = async (
  db: dbClient,
  args: { sourceCardId: number; targetCardId: number; type: CardLinkType },
) => {
  const result = await db.query.cardLinks.findFirst({
    columns: { id: true },
    where: and(
      eq(cardLinks.sourceCardId, args.sourceCardId),
      eq(cardLinks.targetCardId, args.targetCardId),
      eq(cardLinks.type, args.type),
    ),
  });

  return !!result;
};
