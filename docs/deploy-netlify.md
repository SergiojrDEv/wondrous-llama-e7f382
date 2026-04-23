# Deploy no Netlify

## Opcao recomendada: GitHub + Netlify

1. Crie um repositorio no GitHub.
2. Envie esta pasta inteira para o repositorio:
   - `index.html`
   - `src/`
   - `netlify/`
   - `netlify.toml`
   - `docs/`
   - `README.md`
3. No Netlify, abra o site onde esta o dominio atual.
4. Va em `Site configuration > Build & deploy`.
5. Conecte o repositorio do GitHub.
6. Configure:
   - Build command: deixe vazio.
   - Publish directory: `.`
   - Functions directory: `netlify/functions`
7. Va em `Site configuration > Environment variables` e crie:
   - `SUPABASE_URL`
   - `SUPABASE_ANON_KEY`
8. Clique em `Deploy site`.

## Opcao via Netlify CLI

1. Instale ou abra o Netlify CLI.
2. Dentro desta pasta, rode:

```bash
netlify login
netlify link
netlify deploy --prod
```

3. Quando o Netlify perguntar o diretorio de publicacao, use:

```text
.
```

4. Depois configure as variaveis `SUPABASE_URL` e `SUPABASE_ANON_KEY` no painel do Netlify.

## Depois do deploy

1. Abra o dominio publicado.
2. Entre ou crie uma conta na tela inicial usando Supabase Auth.
3. Va em `Ajustes > Supabase`.
4. O app baixa os dados automaticamente ao entrar.
5. Qualquer alteracao feita no app e salva automaticamente no Supabase.

## Importante

Nao publique somente o `index.html`. O deploy precisa incluir a pasta `netlify/functions`, porque o app usa uma Function para ler as variaveis do Supabase no Netlify.
