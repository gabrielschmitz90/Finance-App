Arquitetura e Estrutura de Pastas
=================================

Visão Geral
-----------
Projeto organizado de forma simples, com pastas por funcionalidade (Dashboard e Timeline).

Mapa de arquivos
----------------
- Dashboard/
  - dashboard.html — página do painel
  - dashboard.js — lógica atual do painel
  - dashboard-old.js — versão antiga (manter para referência)

- Timeline/
  - index.html — página da linha do tempo
  - script.js — lógica da timeline
  - style.css — estilos da timeline

Responsabilidades
-----------------
- HTML: marcação e estrutura das páginas
- CSS: estilos e layout
- JS: comportamento e interatividade no cliente

Sugestões de evolução
---------------------
- Adicionar build system (npm) se o projeto crescer.
- Mover lógica compartilhada para `src/` e componentes reutilizáveis.
- Integrar backend para persistência de dados.
