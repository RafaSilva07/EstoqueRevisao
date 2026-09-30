# Etapa 57 — origem da entrada manual e revisão de segurança

Na entrada manual da Revisão, a lista de origem ficava vazia porque os únicos locais externos iniciais são Produção e Expedição. Após confirmação da regra, a consulta passou a mostrar todos os locais externos ativos, inclusive esses dois setores. O administrador geral pode registrar a entrada diretamente, com crédito imediato, responsável, histórico e auditoria, sem criar Envio. Se não houver origem ativa, a tela oferece acesso ao cadastro de locais. Saídas para Produção/Expedição continuam usando Envios.

Na revisão de segurança, foram confirmados Argon2id, sessões revogáveis, validação de entradas, erro genérico de credenciais e ausência de vulnerabilidades de produção conhecidas pelo `npm audit` nesta data. Permanecem pendentes limitação de tentativas de login/refresh, tratamento confiável do IP atrás de proxy e cabeçalhos HTTP de segurança. Nenhuma dessas medidas foi implementada nesta etapa.
