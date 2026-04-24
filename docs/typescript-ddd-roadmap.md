# TypeScript + DDD pragmático

Esta etapa cria a espinha dorsal para a migração gradual do projeto atual.

## Estrutura inicial

- `src/domain`
  - Entidades e tipos centrais do negócio.
- `src/application`
  - Casos de uso puros, sem acoplamento com DOM ou Supabase.
- `src/infrastructure`
  - Mapeadores e adaptadores para V2.

## Objetivo desta primeira passada

1. Dar nomes estáveis ao domínio:
   - `Transaction`
   - `Category`
   - `Account`
   - `Budget`
   - `Goal`
2. Criar os primeiros casos de uso:
   - `buildDashboardSummary`
   - `buildCategoryBreakdown`
   - `createTransaction`
   - `updateTransaction`
3. Criar mapeador V2:
   - `transactionMapper`

## Próximos passos sugeridos

1. Começar a consumir `buildDashboardSummary` e `buildCategoryBreakdown` dentro de `src/dashboard/index.js`
2. Introduzir um repositório tipado para `transactions_v2`
3. Migrar o fluxo de criação/edição de lançamentos para usar os casos de uso de `src/application`
4. Repetir a mesma ideia para `accounts`, `categories`, `budgets` e `goals`
