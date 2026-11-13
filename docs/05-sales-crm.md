# 5. Sales CRM (Salesman app)

[← Back to overview](../README.md)

A separate app at `/salesman` with its own login, session cookie, navigation and density. Nothing about event setup or global configuration ever appears here.

## Features

- **Kanban board** with drag-and-drop; every move is re-validated on the server (ownership + allowed stage transition).
- **Tasks** per lead (exhibitor or sponsor): company, contact role, priority, due date, deal value, pipeline stage, notes and activity log (`sales_tasks`, `sales_task_events`, `sales_task_notes`).
- **Custom stages** per team (`sales_custom_stages`).
- **Event layout view** so a salesman can show a prospect which booths are still free.
- **Profile & invites**: the Owner invites a salesman by email; activation link sets the password.

## Owner side

- `/admin/sales`: the full team board over the same task store (one source of truth, scoped views).
- `/admin/sales/performance`: per-salesman leaderboard (pipeline, closed deals, commission-eligible revenue, workload), drill-down per salesman.

## Design choices

- Ownership key is the account, resolved server-side; a salesman can only read and write their own tasks.
- Repository interface (`SalesTaskRepository`) with in-memory and PostgreSQL implementations, switched by config, so the CRM was usable before the database existed and migrated without UI changes.
