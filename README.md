# Side Hustles — Business Operating System

Operação pessoal em português do Brasil. HTML/CSS/JavaScript sem dependências, offline e hospedado no GitHub Pages.

**Site:** https://arthurlaragao.github.io/side-hustle-30-dias/

**Ciclo:** 5 de novembro a 5 de dezembro de 2026 (31 datas, incluindo os dois extremos). Meta ambiciosa do ciclo: US$ 10.000 de receita bruta recebida; não é promessa de resultado.

## Módulos

- Visão Geral: três prioridades, prazos, tarefas, aprovações, contratos, caixa, MRR e pipeline.
- Digital Products (50%): portfólio, nove etapas, validação, oferta/preço, versões de copy, experimentos, emails, conteúdo, lançamentos, leads e analytics.
- Serviços (40%): 80% Landing Pages e 20% AI Automation dentro da frente, ofertas editáveis, CRM de dez etapas, qualificação, follow-ups e entrega.
- AI Ads (10%): tarefas e registros leves de criativos/desempenho.
- Financeiro: vendas e contratos, despesas e assinaturas; caixa, contratado, pendente e MRR separados.
- Operações: Master Checklist, filtros, dependências, plano semanal, revisão e backup.

As tarefas são registros únicos. A checklist do produto, as etapas e o Master Checklist consultam os mesmos IDs. Status, prioridade, prazo, estimativa, tempo realizado, dependências e notas são editáveis. Tarefas canceladas ficam preservadas e fora do denominador do progresso.

## Produto A e prontidão

Global Dev Job Search System: template Notion em inglês para desenvolvedores internacionais; beta US$19, preço inicial planejado US$29. Alterações de preço e etapa são manuais. O histórico comercial indica revisão pendente; o dashboard não declara que aceitação por compradores, duplicação em outro workspace ou checkout/entrega estejam validados. Não há depoimentos ou resultados inventados.

## Persistência e histórico

O novo estado usa `side-hustles-business-os-v3`. O estado anterior em `side-hustle-novembro-2026-v1` permanece intocado. A migração guarda o JSON original integralmente, cria um snapshot e preserva os antigos checklists por identidade em **Operações → Master Checklist → Tarefas anteriores**. Métricas e decisões anteriores ficam em **Dados e backup**, sem serem somadas ao novo ciclo.

Backups JSON antigos (v1/v2) e novos podem ser importados. A mesclagem usa IDs estáveis, não duplica registros existentes e mantém o registro local em conflitos, guardando a versão recebida para consulta e exportação. Antes da importação é feito um snapshot local. JSON corrompido abre modo de recuperação e não é sobrescrito.

Os dados continuam apenas no navegador, sem login, banco de dados remoto ou sincronização. Exporte backups antes de trocar de dispositivo ou limpar o navegador. O arquivo local, localhost e o site publicado possuem armazenamentos distintos.

## Finanças e analytics

Propostas não assinadas são pipeline. Compras de produtos exigem confirmação. Contratos assinados podem estar pendentes de pagamento. MRR vem exclusivamente de assinaturas ativas, não de setups. Recebimentos, reembolsos e despesas são registros separados. Os resultados de lucro são parciais e estimados com os custos informados, sem impostos, câmbio ou remuneração própria.

O funil permite medições e estimativas distintas. A conversão usa compras confirmadas nas mesmas datas das visitas medidas; períodos sobrepostos bloqueiam a taxa. Publicar conteúdo ou marcar uma campanha como publicada não cria receita.

## Limites operacionais

Planejamento e registros manuais: não envia emails, não publica posts, não processa pagamentos e não integra analytics externos automaticamente. Leads de produto ficam separados do CRM de serviços. O dashboard não modifica o template Notion privado.

## Executar e verificar

Abra `index.html` no navegador ou sirva a pasta por HTTP. Não existe build obrigatório.

```sh
node tests/verify.cjs
```

O teste lê os scripts do HTML publicado e verifica sintaxe, inicialização, migrações v1/v2, preservação de estado, conflitos, dependências, datas, cálculos, 28 subviews, preços e histórico de copy com dados sintéticos isolados. Não substitui QA visual ou aceitação comercial.

GitHub Pages publica `main`, pasta raiz, com `.nojekyll`. O arquivo continua autocontido e funciona offline.
