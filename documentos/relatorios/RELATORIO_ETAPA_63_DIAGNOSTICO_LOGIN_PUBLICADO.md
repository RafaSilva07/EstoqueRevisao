# Etapa 63 — diagnóstico do login publicado

Em 02/10/2026, foi investigado o erro `Failed to fetch` no frontend `https://estoquerevisao.pages.dev`. A versão publicada usa corretamente `https://estoquerevisao-production.up.railway.app/api/v1`; o health check respondeu HTTP 200 com aplicação e banco disponíveis.

A causa confirmada é a origem CORS do backend: tanto o preflight do login quanto as respostas da API retornam `Access-Control-Allow-Origin: https://estoquerevisao.pages.dev/`, com barra final. O navegador envia `Origin: https://estoquerevisao.pages.dev`, sem barra. A divergência bloqueia o acesso do frontend às respostas.

Foi testado o login diretamente na API publicada usando as credenciais do `.env`, sem expor senha, cookie ou tokens. Login e consulta `/auth/me` no modo Admin responderam HTTP 200, com a mesma conta `admin` recuperada na etapa anterior e suas 21 permissões. A sessão de diagnóstico foi encerrada por `/auth/logout` (HTTP 204).

**Correção pendente no Railway:** definir `FRONTEND_URL=https://estoquerevisao.pages.dev` (sem barra final) no serviço do backend e aplicar um novo deploy. O `.env` local deve conservar as URLs de localhost para desenvolvimento. Não foram alterados código funcional, credenciais, configuração do Railway ou dados de negócio nesta investigação; somente a autenticação de diagnóstico e seu logout foram registrados normalmente na auditoria.
