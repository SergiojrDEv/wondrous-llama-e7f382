# Migracao para o Schema V2

Este documento descreve a ordem mais segura para sair do schema atual em `docs/supabase-schema.sql` e chegar no schema relacional de `docs/supabase-schema-v2.sql` sem perder os dados do app.

## Objetivo da V2

Sair do modelo com:

- `transactions` antiga com campos textuais como `descricao`, `cat`, `subcat`, `account`
- `finance_settings.settings` guardando categorias, contas, cartoes, metas e limites em `jsonb`

Para um modelo com tabelas separadas:

- `accounts`
- `credit_cards`
- `categories`
- `category_tags`
- `budgets`
- `goals`
- `recurring_rules`
- `transactions`
- `audit_logs`

## Estrategia recomendada

Nao substitua o banco atual de uma vez. A ordem correta e:

1. criar as novas tabelas da V2
2. migrar os cadastros auxiliares
3. migrar as transacoes
4. validar os dados
5. so depois adaptar o app/backend para ler da V2
6. por ultimo desligar o modelo antigo

## Passo 1: criar a estrutura nova

No Supabase:

1. manter o banco atual como esta
2. executar `docs/supabase-schema-v2.sql`

Isso cria as tabelas novas sem depender da remocao imediata das antigas.

## Passo 2: migrar os cadastros auxiliares

Os dados que hoje vivem em `finance_settings.settings` devem ser quebrados assim:

- `settings.accounts` -> `accounts`
- `settings.creditCards` -> `credit_cards`
- `settings.categories.*` -> `categories`
- `settings.subcategories.*` -> `category_tags`
- `settings.budgetRules` -> `budgets`
- `settings.goals` -> `goals`

Aqui vale fazer um script SQL ou backend de migracao por usuario.

## Passo 3: migrar transacoes

A tabela atual `public.transactions` deve alimentar a nova `public.transactions_v2` da V2 com estes mapeamentos:

- `descricao` -> `description`
- `type` -> `transaction_kind`
- `val` -> `amount`
- `date` -> `transaction_date`
- `due_date` -> `due_date`
- `status` -> `status`
- `payment_method` -> `payment_method`
- `credit_card_id` -> `credit_card_id`
- `recurrence_id` -> `recurring_rule_id` ou manter vazio ate a regra ser migrada
- `installment_group` -> `installment_group_id`
- `installment_number` -> `installment_number`
- `installment_total` -> `installment_total`

Os campos textuais `cat`, `subcat` e `account` devem virar referencias:

- `cat` -> `categories.id`
- `subcat` -> `category_tags.id`
- `account` -> `accounts.id`

## Passo 4: validacoes antes do corte

Antes de trocar o app para a V2, valide:

- quantidade de contas por usuario
- quantidade de categorias por usuario
- quantidade de etiquetas por usuario
- quantidade de metas por usuario
- quantidade de transacoes por usuario
- soma de receitas, despesas e investimentos por mes
- total de parcelas por grupo

Se os totais nao baterem, nao corte ainda.

## Passo 5: adaptar a aplicacao

A ordem recomendada no codigo e:

1. backend novo lendo e gravando na V2
2. frontend trocando chamadas por dominio:
   - auth
   - transactions
   - planning
   - cards
3. remover dependencia de `finance_settings.settings` para regras estruturadas

## Passo 6: fase de convivencia

Durante uma fase curta, mantenha:

- schema atual ainda acessivel
- schema V2 em uso para novos fluxos

Quando tudo estiver validado:

- congelar escrita no modelo antigo
- fazer backup final
- remover ou arquivar estruturas antigas

## Ganhos da V2

- consultas mais rapidas e previsiveis
- melhor suporte a cartao, fatura e parcelas
- regras de recorrencia mais limpas
- auditoria real
- menos dependencia de `jsonb` para dados centrais
- caminho mais natural para backend modular

## Proximo passo recomendado

Depois desse schema, o passo mais certo e criar o backend modular em dominios:

- `auth`
- `transactions`
- `planning`
- `cards`
- `audit`

Assim a aplicacao deixa de concentrar regras criticas no frontend.
