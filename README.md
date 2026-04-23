# Finance Flow

Software de controle financeiro pessoal em HTML, CSS e JavaScript puro.

## Como usar

Abra o arquivo `index.html` no navegador. Os dados ficam salvos no `localStorage` do proprio navegador.

## Como conectar no Supabase e Netlify

1. No Supabase, abra o SQL Editor e execute `docs/supabase-schema.sql`.
2. No Supabase, va em `Authentication > Providers > Email` e mantenha a confirmacao por e-mail ativada.
3. Em `Authentication > URL Configuration`, configure a URL do site publicado no Netlify como Site URL.
4. No Netlify, entre no site do projeto anterior e publique esta pasta como o novo deploy.
5. Em `Site configuration > Environment variables`, crie se quiser sobrescrever a configuracao embutida:
   - `SUPABASE_URL`
   - `SUPABASE_ANON_KEY`
6. Garanta que o dominio esta apontando para este mesmo site no Netlify.
7. Abra o site publicado, crie a conta, confirme o e-mail e depois entre na tela inicial.

Ao entrar, o app baixa os dados do Supabase automaticamente. Depois disso, cada alteracao feita no app e salva localmente e sincronizada com o Supabase em segundo plano.

O app ja tem fallback para o projeto Supabase `gxwukctgfrquureyerli` usando a publishable key publica. O app usa a tabela antiga `transactions` com os campos `descricao`, `cat` e `val`, para facilitar a migracao do projeto anterior. Categorias, contas e metas ficam em `finance_settings`. Dados pessoais do cadastro ficam em `user_profiles`.

## Estrutura

- `index.html`: estrutura das telas e secoes do app.
- `src/styles.css`: layout, tema visual e responsividade.
- `src/app.js`: regras de negocio, persistencia local, graficos, filtros e exportacao.
- `docs/supabase-schema.sql`: estrutura SQL opcional para uma futura integracao com Supabase.
- `netlify.toml`: configuracao de deploy para Netlify.
- `netlify/functions/config.js`: entrega as variaveis publicas do Supabase para o navegador.

## Funcionalidades

- Dashboard mensal com receitas, despesas, investimentos e saldo livre.
- Login e cadastro com Supabase Auth antes de acessar o painel.
- Cadastro com nome completo, CPF, telefone, data de nascimento, e-mail e senha.
- Lancamentos com categoria, conta, valor e data.
- Status pago, pendente ou previsto.
- Edicao de lancamentos e acao rapida para marcar como pago.
- Vencimentos, forma de pagamento, cartoes, parcelas e recorrencia mensal.
- Painel inteligente com gasto diario seguro, comparativo e alertas.
- Criacao e remocao de categorias, contas e metas pela aba Ajustes.
- Limites mensais editaveis para categorias de despesa.
- Filtros por tipo e busca textual.
- Orcamentos por categoria.
- Metas de investimento.
- Grafico dos ultimos 6 meses.
- Exportacao CSV, backup JSON e importacao JSON com previa antes de somar ou substituir dados.
- Dados de exemplo para testar rapidamente.

## Proximos passos sugeridos

- Melhorar relatorios de faturas de cartao.
- Criar testes automatizados para importacao, parcelas e sincronizacao.
- Separar regras de negocio em modulos caso o app cresca.
