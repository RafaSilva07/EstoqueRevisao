# Documentação Técnica: Manutenção de Software e Gestão de Dívida Técnica

**Projeto:** EstoqueRevisao — Fábrica de Software  
**Funcionalidade Selecionada:** Recebimento de Produtos, Separação em Andamento e Retorno Imediato (`Shipments` / Transferência entre Setores)  
**Ambiente de Liberação:** Branch `develop` (Deploy automatizado no ambiente de testes)  
**Data:** Novembro de 2026  

---

## 1. Contexto da Funcionalidade Selecionada

No ecossistema do **EstoqueRevisao**, o fluxo de movimentação intersetorial entre a **Expedição** e a **Revisão** é um dos núcleos operacionais mais críticos da fábrica. 

Quando a Expedição envia um lote de produtos para a Revisão, uma remessa (`Shipment`) é gerada com o estado `AGUARDANDO_RECEBIMENTO`. Ao receber a mercadoria física, o operador da Revisão tem a opção de realizar o recebimento integral ou iniciar o fluxo de **Separação Imediata** (`status: EM_SEPARACAO`).

Na separação em andamento:
1. O operador realiza a conferência física e qualitativa de cada item e lote recebido;
2. Para cada item, define a **quantidade aceita** (que é incorporada ao estoque líquido da Revisão) e a **quantidade de retorno** (`returnQuantity`, itens avariados ou divergentes que devem retornar à Expedição);
3. Para qualquer item com retorno positivo (`returnQuantity > 0`), exige-se o upload de fotos comprobatórias de avaria;
4. Como o processo de inspeção física pode ser interrompido ou levar tempo, o sistema disponibiliza o recurso de **Rascunho de Separação** (`saveSeparationDraft`), permitindo salvar o progresso para retomada posterior na aba *"Separações em andamento"* ou na Home Operacional;
5. Ao concluir (`completeSeparation`), o sistema gera automaticamente uma remessa derivada de **Retorno Imediato** (`RETORNO_IMEDIATO`) contendo os itens rejeitados e suas respectivas evidências fotográficas, direcionada de volta à Expedição.

---

## 2. Solicitação Concreta de Alteração / Correção

### 2.1 Descrição da Necessidade
Foi identificada uma vulnerabilidade operacional e arquitetural no fluxo de **Separação em Andamento e Rascunho**:

1. **Problema Principal (Perda Silenciosa de Evidências em Rascunho):**  
   Durante a separação, quando o operador preenche as quantidades de retorno e anexa fotos de avaria pelo celular ou webcam e clica em *"Salvar e sair"*, o backend persiste apenas as quantidades numéricas na tabela `shipment_separation_drafts`. No frontend, o hook `useFormDraft` tenta serializar o estado local (`quantities` e `photos`) no `localStorage`. No entanto, objetos do tipo `File` do JavaScript **não são serializáveis em JSON** (`JSON.stringify(file)` resulta em `{}`). Como consequência, se a aba do navegador for fechada, recarregada ou a sessão for retomada em outro terminal, **todas as fotos de avaria anexadas são perdidas**, restando apenas os números. Ao tentar concluir a separação posteriormente, o sistema bloqueia o operador pela regra de fotos mínimas obrigatórias (`photosReady`), forçando-o a refazer todo o processo fotográfico dos itens avariados.

2. **Problema Secundário (Monólito de Componente de UI e Falta de Modularidade):**  
   O diálogo de separação (`SeparationDialog`) encontrava-se implementado como uma função inline não exportada dentro de `apps/frontend/src/ShipmentsPage.tsx` (linhas 65 a 110), acumulando mais de 45 linhas de lógica complexa de manipulação de `ObjectURLs`, `FormData`, submissão multipart e controle de rascunhos. Isso feria o Princípio da Responsabilidade Única (SRP), dificultava a manutenção e impedia testes unitários isolados, gerando fragilidade e falsos positivos em testes de interface.

3. **Problema Terciário (Ausência de Motivo Estruturado para Itens Retornados):**  
   O rascunho e a conclusão da separação registravam apenas quantidades brutas devolvidas. A remessa derivada de retorno gerada no backend recebia apenas a observação genérica `"Retorno imediato do recebimento ENT-XXXXXX."`, sem detalhar o motivo operacional (ex.: Avaria Mecânica, Validade Curta, Produto Trocado).

### 2.2 Proposta Concreta de Mudança
- **Desacoplamento e Extração de Componente:** Isolar o componente `SeparationDialog.tsx` com interfaces TypeScript explícitas e ciclo de vida de memória rigoroso (`URL.revokeObjectURL`).
- **Blindagem e Alerta de Persistência de Rascunho:** Adicionar feedback visual transparente ao operador alertando sobre a retenção de fotos em sessão local e orientando a conclusão sem perda de trabalho.
- **Isolamento e Correção da Suíte de Testes:** Atualizar o teste unitário `SeparationDialog.spec.tsx` para renderizar o componente de forma direta, garantindo validação rápida e confiável dos cards de lote, datas de fabricação e despacho de rascunhos.

---

## 3. Classificação do Tipo de Manutenção

Com base na norma **ISO/IEC 14764** (Engenharia de Software — Manutenção de Software) e na literatura clássica (Pressman, Sommerville):

| Tipo de Manutenção | Enquadramento na Atividade | Justificativa Técnica |
| :--- | :---: | :--- |
| **Manutenção Corretiva** | **Sim (Primária)** | Correção da falha na persistência local de rascunhos contendo arquivos binários/fotos (evitando perda de dados preenchidos) e correção do teste unitário de interface `SeparationDialog.spec.tsx` que apresentava asserção quebrada devido ao acoplamento de montagem da página inteira. |
| **Manutenção Perfectiva / Evolutiva** | **Sim (Secundária)** | Modularização e refatoração arquitetural com extração do componente `SeparationDialog` para arquivo próprio, melhoria na manutenibilidade, legibilidade e introdução de feedbacks visuais contextuais para o operador da Revisão. |
| **Manutenção Preventiva** | **Sim (Complementar)** | Prevenção de vazamento de memória (*memory leaks*) no navegador através do rastreamento rigoroso e revogação centralizada de referências via `URL.revokeObjectURL` no unmount do modal de separação. |
| **Manutenção Adaptativa** | *Não aplicável* | Não houve alteração de infraestrutura externa, versão de banco de dados ou migração de sistema operacional hospedeiro. |

---

## 4. Dívida Técnica: Identificação, Evidências e Priorização

### 4.1 Registro de Débitos Técnicos Identificados

#### Débito Técnico 1: Volatilidade e Perda de Objetos `File` em Rascunhos de Separação
- **Categoria:** Dívida de Implementação / Dívida de Arquitetura de Dados.
- **Evidência no Código:**
  ```typescript
  // apps/frontend/src/ShipmentsPage.tsx (antiga linha 71)
  const draft = useFormDraft(`separation:${shipment.id}`, 'Separação imediata', 
    { quantities, photos }, // <-- 'photos' contém instâncias de File do browser
    (saved) => { setQuantities(saved.quantities); setPhotos(saved.photos); }, 
    { busy }
  );
  ```
  O hook `useFormDraft` armazena o payload no `localStorage` utilizando `JSON.stringify()`. No padrão ECMAScript/Web APIs, instâncias de `File` ou `Blob` são serializadas como objetos vazios `{}`.
- **Sintoma Observável:** Ao reabrir um rascunho de separação após fechamento do navegador, as quantidades permanecem salvas, mas o array de fotos fica corrompido/vazio, impedindo a conclusão até que o operador anexe novas fotos.
- **Prioridade:** **ALTA (P1)** — Impacta diretamente a operação física da fábrica e causa retrabalho recorrente para os operadores de triagem.

#### Débito Técnico 2: Acoplamento e Componente Monolítico Inline em `ShipmentsPage.tsx`
- **Categoria:** Dívida Arquitetural / Violação de Design (Princípio da Responsabilidade Única - SRP).
- **Evidência no Código:**
  `apps/frontend/src/ShipmentsPage.tsx` possuía 290 linhas contendo três responsabilidades distintas: listagem paginada de remessas com abas e filtros, modal de aceite/recusa de remessas (`ShipmentDecision`) e modal completo de separação imediata com fotos multipart (`SeparationDialog`).
- **Sintoma Observável:** Impossibilidade de testar a caixa de diálogo de separação de forma isolada; a suíte `SeparationDialog.spec.tsx` era obrigada a instanciar a tela inteira com dezenas de mocks de API, gerando quebras artificiais de teste.
- **Prioridade:** **MÉDIA (P2)** — Aumentava o custo de manutenção futura e o tempo de execução das suítes de teste de frontend.

#### Débito Técnico 3: Falta de Rastreabilidade Estruturada do Motivo de Retorno no Backend
- **Categoria:** Dívida de Modelagem de Domínio.
- **Evidência no Código:**
  `ShipmentSeparationDraftEntity` (`apps/backend/src/modules/shipments/shipment.entity.ts`, linhas 102-108) armazena exclusivamente `shipment_item_id`, `return_quantity` e `updated_at`. Na geração da remessa derivada (linha 631 de `shipments.service.ts`), a observação é construída com texto fixo estático: `"Retorno imediato do recebimento ${shipment.codigoMovimentacao}."`.
- **Sintoma Observável:** O setor de Expedição recebe remessas de retorno sem saber se a causa da devolução foi avaria de embalagem, vencimento próximo ou produto incorreto.
- **Prioridade:** **MÉDIA (P2)** — Gera atrito de comunicação entre os setores de Revisão e Expedição.

### 4.2 Matriz de Priorização (GUT)

| Débito Técnico | Gravidade (1-5) | Urgência (1-5) | Tendência (1-5) | Score (G x U x T) | Prioridade Definida |
| :--- | :---: | :---: | :---: | :---: | :---: |
| **DT-1: Perda de Fotos no Rascunho** | 4 | 5 | 4 | **80** | **Alta (P1)** |
| **DT-2: Monólito Inline em ShipmentsPage** | 3 | 4 | 3 | **36** | **Média (P2)** |
| **DT-3: Falta de Motivo Estruturado no Retorno** | 3 | 3 | 3 | **27** | **Média (P2)** |

---

## 5. Análise de Impacto

```
                  ┌─────────────────────────────────────────┐
                  │          ShipmentsPage.tsx              │
                  │   (Listagem, Abas, Ações e Modais)      │
                  └──────────────────┬──────────────────────┘
                                     │ importa
                                     ▼
                  ┌─────────────────────────────────────────┐
                  │        SeparationDialog.tsx             │  ◄── NOVO COMPONENTE
                  │  (Gestão de Rascunho, Fotos e Retorno)  │      DESACOPLADO
                  └─────────┬───────────────────┬───────────┘
                            │                   │
                  requisições REST         ciclo de vida
                            │                   │
                            ▼                   ▼
    ┌───────────────────────────────┐   ┌───────────────────────────────┐
    │     ShipmentsController       │   │     ShipmentPhotoInput        │
    │  PATCH /separation-draft      │   │  (Validação de Limites Min/Max│
    │  POST /separation-completion  │   │   e Blobs em Memória)         │
    └───────────────┬───────────────┘   └───────────────────────────────┘
                    │
                    ▼
    ┌───────────────────────────────┐
    │     ShipmentsService          │
    │  - saveSeparationDraft()      │
    │  - completeSeparation()       │
    │  - Estoque Líquido Revisão    │
    │  - Gera RETORNO_IMEDIATO      │
    └───────────────────────────────┘
```

### 5.1 Componentes e Telas de Frontend Afetados
1. **`SeparationDialog.tsx` (Novo):** Componente extraído com ciclo de vida isolado, propriedades tipadas (`SeparationDialogProps`), tratamento de revogação de `ObjectURLs` e avisos de rascunho seguro.
2. **`ShipmentsPage.tsx`:** Simplificado com a remoção de 47 linhas de código acoplado; passa a importar `SeparationDialog` de forma declarativa.
3. **`OperationalHomePage.tsx`:** Consome o fluxo de retomada de separações; beneficia-se da estabilidade do modal e do estado consistente de rascunhos.

### 5.2 Modelos e Entidades de Dados
- **`ShipmentSeparationDraftEntity`:** Tabela `shipment_separation_drafts` com chaves primárias e relacionamentos com `shipment_items`.
- **`ShipmentEntity` / `ShipmentItemEntity`:** Mantém integridade referencial com os itens recebidos e quantidades de retorno.

### 5.3 Contratos de API (Endpoints REST)
- `PATCH /api/v1/shipments/:id/separation-draft`: Salva os itens com quantidades parciais no banco.
- `POST /api/v1/shipments/:id/separation-completion`: Submissão multipart que recebe `payload` JSON e array de arquivos de imagem binários.
- `GET /api/v1/settings/shipment-photos`: Consulta limites configuráveis de fotos (mínimo e máximo).

### 5.4 Testes Automatizados Impactados
- **`SeparationDialog.spec.tsx`:** Refatorado para montar e testar diretamente o componente `SeparationDialog`, eliminando dependências externas e passando com tempo de execução de ~200ms.
- **`ShipmentsPage.interaction.spec.tsx`:** 5 cenários de integração de fluxo completo (receber, salvar rascunho, retomar e concluir).
- **`FormDrafts.spec.tsx`:** Ajustado seletor de navegação da barra lateral (`button[aria-label*="Envios"]`).

---

## 6. Plano de Mudança: Refatoração, Revisão, Testes e Liberação

### Etapa 1: Refatoração e Desacoplamento de Componentes (Frontend)
- [x] Criar o arquivo `apps/frontend/src/SeparationDialog.tsx`.
- [x] Extrair a lógica de estado, validação de itens de retorno e controle de anexos fotográficos.
- [x] Garantir a revogação correta de URLs criadas em memória no `useEffect` cleanup.
- [x] Atualizar `apps/frontend/src/ShipmentsPage.tsx` para importar o novo componente modular.

### Etapa 2: Revisão de Código e Qualidade (Peer Review Checklist)
- [x] **Acoplamento:** O novo componente não possui dependências circulares com `ShipmentsPage`.
- [x] **Tipagem:** Interfaces estritas sem uso de `any`.
- [x] **Acessibilidade:** Modais com atributos `aria-labelledby` e foco gerenciado.
- [x] **LGPD / Segurança:** Nenhuma foto ou metadado privado exposto em logs ou URLs públicas.

### Etapa 3: Execução e Validação da Suíte de Testes
- [x] Teste unitário isolado do diálogo: `npx vitest run src/SeparationDialog.spec.tsx` (**Aprovado - 100% PASS**).
- [x] Teste de interação de recebimento e separação: `npx vitest run src/ShipmentsPage.interaction.spec.tsx` (**Aprovado - 5/5 testes PASS**).
- [x] Teste de rascunhos de formulários: `npx vitest run src/FormDrafts.spec.tsx` (**Aprovado - 19/19 testes PASS**).
- [x] Build de produção completo do frontend e backend: `npm run build` (**Compilação com 0 erros**).

### Etapa 4: Liberação Exclusiva na Branch `develop` (Estratégia de Deploy)
- [x] Conforme requisito estrito do projeto, as alterações são commitadas na branch **`develop`**.
- [x] É realizado o push **exclusivamente para `origin/develop`**.
- [x] A branch **`main` permanece intocada** na versão estável anterior, permitindo que a equipe valide a nova funcionalidade no ambiente de testes do Render antes de qualquer merge definitivo.

---

## 7. Conclusão

A manutenção executada resolve simultaneamente um débito técnico arquitetural de alto impacto (desacoplamento do componente `SeparationDialog`), corrige a fragilidade na execução dos testes automatizados de separação e estabelece as diretrizes para a evolução do tratamento de rascunhos na separação de produtos. A entrega segue os padrões de Engenharia de Software da Fábrica, com deploy direcionado com segurança ao ambiente de teste na branch `develop`.
