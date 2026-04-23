# Deploy no Cloudflare Pages

## Opcao recomendada: GitHub + Cloudflare Pages

1. Envie esta pasta inteira para um repositorio no GitHub.
2. No Cloudflare, abra `Workers & Pages`.
3. Clique em `Create application`.
4. Escolha `Pages` e depois `Connect to Git`.
5. Conecte o repositorio deste projeto.
6. Configure o build assim:
   - Framework preset: `None`
   - Build command: deixe vazio
   - Build output directory: `.`
7. Em `Settings > Environment variables`, crie se quiser sobrescrever a configuracao embutida:
   - `SUPABASE_URL`
   - `SUPABASE_ANON_KEY`
8. Clique em `Save and Deploy`.

## Como funciona neste projeto

- O app tenta ler a configuracao do Supabase primeiro em `/.netlify/functions/config`.
- Se nao existir, ele tenta `/api/config`, que e o endpoint usado pelo Cloudflare Pages.
- Se nenhum endpoint responder, ele usa o fallback embutido no front-end com a publishable key publica.

## Depois do deploy

1. No Supabase, va em `Authentication > URL Configuration`.
2. Configure a URL publicada do Cloudflare Pages como `Site URL`.
3. Abra o site.
4. Crie a conta, confirme o e-mail e entre normalmente.

## Dominio customizado

1. No projeto do Cloudflare Pages, abra `Custom domains`.
2. Adicione seu dominio.
3. Aguarde a propagacao do DNS.
4. Atualize o `Site URL` no Supabase para o dominio final.
