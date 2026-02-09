# 🗄️ Modelo de Banco de Dados TicketFlow

Este documento descreve o esquema do banco de dados utilizado pelo sistema TicketFlow, que é otimizado para compatibilidade com PostgreSQL e plataformas como o Supabase. O design visa garantir a integridade dos dados, a rastreabilidade das operações e a escalabilidade do sistema de gerenciamento de eventos, vendas e check-ins.

Todos os IDs primários são do tipo `UUID` (Universally Unique Identifier), garantindo identificadores únicos e não sequenciais, ideais para sistemas distribuídos e para segurança. A extensão `uuid-ossp` é utilizada para a geração automática desses IDs.

---

## 🧾 Tabela: `users`

**Descrição**: Armazena as informações dos usuários que podem interagir com o sistema, como criadores de eventos e administradores.

### 📊 Colunas

-   **`id`**: `UUID` (Chave Primária, Default: `uuid_generate_v4()`)
    -   Finalidade: Identificador único e imutável para cada usuário.
-   **`username`**: `TEXT` (Não Nulo, Único)
    -   Finalidade: Nome de usuário exclusivo para identificação e login (se a funcionalidade de autenticação for expandida).
-   **`email`**: `TEXT` (Não Nulo, Único)
    -   Finalidade: Endereço de e-mail exclusivo do usuário, utilizado para contato e como identificador de conta.
-   **`password_hash`**: `TEXT` (Não Nulo)
    -   Finalidade: Armazena o hash seguro da senha do usuário. **Importante**: Senhas nunca são armazenadas em texto puro.
-   **`created_at`**: `TIMESTAMP WITH TIME ZONE` (Não Nulo, Default: `now()`)
    -   Finalidade: Registra a data e hora em que o usuário foi criado no sistema.
-   **`updated_at`**: `TIMESTAMP WITH TIME ZONE` (Não Nulo, Default: `now()`)
    -   Finalidade: Registra a última data e hora em que as informações do usuário foram modificadas.

### 🔗 Relações

-   Um `user` pode criar vários `events`.
-   Um `user` pode registrar várias `sales`.

---

## 🧾 Tabela: `events`

**Descrição**: Contém os detalhes de cada evento que o sistema gerencia, incluindo informações básicas e dados financeiros consolidados.

### 📊 Colunas

-   **`id`**: `UUID` (Chave Primária, Default: `uuid_generate_v4()`)
    -   Finalidade: Identificador único para cada evento.
-   **`name`**: `TEXT` (Não Nulo)
    -   Finalidade: Nome completo do evento.
-   **`location`**: `TEXT` (Não Nulo)
    -   Finalidade: Local onde o evento será realizado.
-   **`event_date`**: `DATE` (Não Nulo)
    -   Finalidade: Data específica de realização do evento.
-   **`event_time`**: `TIME` (Não Nulo)
    -   Finalidade: Hora específica de início do evento.
-   **`ticket_price`**: `NUMERIC(10, 2)` (Não Nulo)
    -   Finalidade: Preço padrão de um ingresso normal para este evento.
-   **`status`**: `TEXT` (Não Nulo, Default: `'active'`)
    -   Finalidade: Indica o estado atual do evento (`'active'`, `'finished'`, `'cancelled'`).
-   **`box_office_sales`**: `NUMERIC(10, 2)` (Default: `0.00`)
    -   Finalidade: Receita total das vendas de ingressos na bilheteria física.
-   **`online_sales`**: `NUMERIC(10, 2)` (Default: `0.00`)
    -   Finalidade: Receita total das vendas de ingressos online.
-   **`infra_cost`**: `NUMERIC(10, 2)` (Default: `0.00`)
    -   Finalidade: Custo total com a infraestrutura e montagem do evento.
-   **`staff_cost`**: `NUMERIC(10, 2)` (Default: `0.00`)
    -   Finalidade: Custo total com a equipe de trabalho do evento.
-   **`event_other_expenses`**: `NUMERIC(10, 2)` (Default: `0.00`)
    -   Finalidade: Outras despesas diversas diretamente relacionadas ao evento (ex: atrações, licenças).
-   **`bar_sales`**: `NUMERIC(10, 2)` (Default: `0.00`)
    -   Finalidade: Receita total das vendas do bar do evento.
-   **`bar_cost_beverages`**: `NUMERIC(10, 2)` (Default: `0.00`)
    -   Finalidade: Custo com bebidas para o bar.
-   **`bar_cost_misc`**: `NUMERIC(10, 2)` (Default: `0.00`)
    -   Finalidade: Custo com copos, gelo e outros itens diversos do bar.
-   **`bar_other_expenses`**: `NUMERIC(10, 2)` (Default: `0.00`)
    -   Finalidade: Outras despesas diversas do bar.
-   **`observations`**: `TEXT` (Nulo permitido)
    -   Finalidade: Campo para anotações ou observações adicionais sobre o evento ou seu relatório financeiro.
-   **`created_by_user_id`**: `UUID` (Chave Estrangeira para `users.id`, `ON DELETE SET NULL`)
    -   Finalidade: Vincula o evento ao usuário que o criou. Se o usuário for excluído, este campo será definido como NULO.
-   **`created_at`**: `TIMESTAMP WITH TIME ZONE` (Não Nulo, Default: `now()`)
    -   Finalidade: Data e hora da criação do registro do evento.
-   **`updated_at`**: `TIMESTAMP WITH TIME ZONE` (Não Nulo, Default: `now()`)
    -   Finalidade: Última data e hora em que os detalhes do evento foram atualizados.

### 🔗 Relações

-   Um `event` é criado por um `user`.
-   Um `event` pode ter várias `sales`.
-   Um `event` pode ter muitos `tickets` (tanto normais quanto cortesias).
-   A exclusão de um `event` resultará na exclusão em cascata de todas as `sales` e `tickets` relacionados.

---

## 🧾 Tabela: `sales`

**Descrição**: Registra cada transação de venda que agrupa um ou mais ingressos normais para um evento. Cortesias não são registradas nesta tabela; elas têm `sale_id` nulo na tabela `tickets`.

### 📊 Colunas

-   **`id`**: `UUID` (Chave Primária, Default: `uuid_generate_v4()`)
    -   Finalidade: Identificador único para a transação de venda.
-   **`event_id`**: `UUID` (Não Nulo, Chave Estrangeira para `events.id`, `ON DELETE CASCADE`)
    -   Finalidade: Vincula a venda ao evento correspondente.
-   **`sale_code`**: `TEXT` (Não Nulo, Único)
    -   Finalidade: Código legível e único que identifica esta venda (ex: `SALE-XXXXXXXX`), usado para referência externa.
-   **`total_amount`**: `NUMERIC(10, 2)` (Não Nulo)
    -   Finalidade: O valor total pago por todos os ingressos nesta transação de venda.
-   **`number_of_tickets`**: `INTEGER` (Não Nulo)
    -   Finalidade: A quantidade de ingressos normais incluídos nesta venda.
-   **`created_by_user_id`**: `UUID` (Chave Estrangeira para `users.id`, `ON DELETE SET NULL`)
    -   Finalidade: ID do usuário que registrou esta venda.
-   **`created_at`**: `TIMESTAMP WITH TIME ZONE` (Não Nulo, Default: `now()`)
    -   Finalidade: Data e hora em que a venda foi registrada.
-   **`updated_at`**: `TIMESTAMP WITH TIME ZONE` (Não Nulo, Default: `now()`)
    -   Finalidade: Última data e hora em que os detalhes da venda foram atualizados.

### 🔗 Relações

-   Uma `sale` pertence a um `event`.
-   Uma `sale` é registrada por um `user`.
-   Uma `sale` possui um ou mais `tickets` (com `ticket_type` = 'normal').
-   A exclusão de uma `sale` resultará na exclusão em cascata de todos os `tickets` associados a ela.

---

## 🧾 Tabela: `tickets`

**Descrição**: Representa um ingresso individual. Esta tabela armazena tanto ingressos vendidos quanto cortesias.

### 📊 Colunas

-   **`id`**: `UUID` (Chave Primária, Default: `uuid_generate_v4()`)
    -   Finalidade: Identificador único para cada ingresso.
-   **`ticket_code`**: `TEXT` (Não Nulo, Único)
    -   Finalidade: Código legível e único impresso no ingresso (ex: `TICKET-XXXXXXXX`), usado para check-in.
-   **`event_id`**: `UUID` (Não Nulo, Chave Estrangeira para `events.id`, `ON DELETE CASCADE`)
    -   Finalidade: Vincula o ingresso ao evento específico para o qual ele é válido.
-   **`sale_id`**: `UUID` (Chave Estrangeira para `sales.id`, `ON DELETE CASCADE`, Nulo permitido)
    -   Finalidade: Vincula o ingresso à transação de venda correspondente. É NULO se o `ticket_type` for `'courtesy'`.
-   **`buyer_name`**: `TEXT` (Não Nulo)
    -   Finalidade: Nome completo do portador do ingresso ou comprador principal.
-   **`ticket_type`**: `TEXT` (Não Nulo)
    -   Finalidade: Especifica se o ingresso é uma venda normal (`'normal'`) ou uma cortesia (`'courtesy'`).
-   **`status`**: `TEXT` (Não Nulo, Default: `'valid'`)
    -   Finalidade: O estado atual do ingresso (`'valid'` para não usado, `'used'` para check-in realizado, `'cancelled'`).
-   **`checked_in_at`**: `TIMESTAMP WITH TIME ZONE` (Nulo permitido)
    -   Finalidade: Carimbo de data/hora em que o check-in do ingresso foi realizado. É NULO se o check-in ainda não ocorreu.
-   **`created_at`**: `TIMESTAMP WITH TIME ZONE` (Não Nulo, Default: `now()`)
    -   Finalidade: Data e hora da criação do registro do ingresso.
-   **`updated_at`**: `TIMESTAMP WITH TIME ZONE` (Não Nulo, Default: `now()`)
    -   Finalidade: Última data e hora em que os detalhes do ingresso foram atualizados.

### 🔗 Relações

-   Um `ticket` pertence a um `event`.
-   Um `ticket` normal (`ticket_type` = 'normal') pertence a uma `sale`.
-   A exclusão de um `event` ou uma `sale` (para tickets normais) resultará na exclusão em cascata dos `tickets` relacionados.

---

## 🧾 Tabela: `error_logs`

**Descrição**: Registra logs de erro do sistema para diagnóstico e monitoramento, incluindo detalhes técnicos e sugestões de solução.

### 📊 Colunas

-   **`id`**: `UUID` (Chave Primária, Default: `uuid_generate_v4()`)
    -   Finalidade: Identificador único para cada registro de log de erro.
-   **`code`**: `TEXT` (Nulo permitido)
    -   Finalidade: Um código interno que categoriza o erro (ex: `DB_CONN_FAIL`, `VALIDATION_ERROR`).
-   **`message`**: `TEXT` (Não Nulo)
    -   Finalidade: Uma mensagem de erro amigável que pode ser exibida ao usuário.
-   **`cause`**: `TEXT` (Nulo permitido)
    -   Finalidade: Detalhes técnicos da causa do erro (ex: a mensagem da exceção JavaScript, erro do banco de dados).
-   **`solution`**: `TEXT` (Não Nulo)
    -   Finalidade: Instruções sugeridas para resolver o erro ou mitigar o problema.
-   **`context`**: `TEXT` (Nulo permitido)
    -   Finalidade: O módulo ou área do sistema onde o erro ocorreu (ex: `Login`, `Vendas`, `Check-in`).
-   **`created_at`**: `TIMESTAMP WITH TIME ZONE` (Não Nulo, Default: `now()`)
    -   Finalidade: Carimbo de data/hora em que o erro foi registrado.

