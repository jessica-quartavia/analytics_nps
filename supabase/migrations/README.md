# Migrations — Business Data only

Aplicar **somente** no Supabase `project_ref=rckpuebaiswrxzmywllv`.

**Não** aplicar no BASE QV (`lacinxsvjdwalkchxyeo`).

VoC automation:

- `20261001170000_create_analytics_nps_voc_automation.sql`

Com MCP Supabase apontando para Business Data:

```
apply_migration name=create_analytics_nps_voc_automation
```

Ou `npm run voc:migration:print` e SQL no Dashboard.
