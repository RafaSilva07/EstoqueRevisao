# Etapa 59 — detalhe unificado na fila PCP

A fila PCP ainda renderizava um modal próprio no layout antigo, apesar da atualização dos demais resumos. Esse caminho passou a reutilizar `MovementDetailModal`, com a mesma hierarquia visual nos temas claro/escuro e em telas pequenas.

Foram preservados histórico de eventos, fotos por produto, navegação entre registro/grupo e confirmação da execução individual. O detalhe individual usa a contagem total do grupo retornada pela API; responsáveis pelo envio/recebimento mantêm suas datas. Sem alteração de backend, banco ou regras operacionais.
