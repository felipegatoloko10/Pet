import { emptyWorkspace, newBoard, type Workspace } from "@pingo/core";
export function demoWorkspace(): Workspace {
  const w = emptyWorkspace(Intl.DateTimeFormat().resolvedOptions().timeZone);
  const b = newBoard("demo", "Minha rotina");
  w.boards = [b];
  w.preferences.defaultBoardId = b.id;
  const today = new Date().toLocaleDateString("en-CA");
  w.tasks = [
    {
      id: "demo-1",
      boardId: b.id,
      columnId: b.columns[0].id,
      title: "Planejar uma semana mais leve",
      notes:
        "Este é um exemplo local. Conecte sua conta para começar sua rotina.",
      dueDate: today,
      scheduledStart: null,
      scheduledEnd: null,
      priority: "high",
      completed: false,
      revision: 1,
      syncState: "pending",
    },
    {
      id: "demo-2",
      boardId: b.id,
      columnId: b.columns[1].id,
      title: "Separar um tempo para mim",
      notes: "",
      dueDate: today,
      scheduledStart: null,
      scheduledEnd: null,
      priority: "normal",
      completed: false,
      revision: 1,
      syncState: "pending",
    },
  ];
  return w;
}
