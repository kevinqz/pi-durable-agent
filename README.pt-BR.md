# Pi Durable Agent

Aplicação independente e aberta que reúne **Pi Durable**, a memória do **OptChat Durable** e ferramentas do **Cloudflare Code Mode**.

**Prévia de desenvolvimento.** A demonstração usa os runtimes reais com respostas de modelo simuladas. O único conector implementado cria notas locais da sessão. Novas sessões já oferecem checkpoints e restauração, verificados localmente; a instalação local completa também tem um procedimento de backup offline. Na Cloudflare, uma conversa e sua aprovação pendente sobreviveram à atualização dev.1 → dev.2 e a um reinício forçado do processo da sessão de demonstração. O resultado foi entregue e a conversa continuou. Backup e restauração coordenados na nuvem, outras janelas de falha, modelos reais e operação em produção ainda precisam de qualificação.

## Começar do zero

Instale Node.js **22.19 ou superior** e use:

```sh
git clone https://github.com/kevinqz/pi-durable-agent.git
cd pi-durable-agent
npm ci
npm run dev
```

Abra o endereço exibido, normalmente **http://127.0.0.1:8787**. Não é necessário instalar Pi previamente, usar uma distribuição customizada, ter conta Cloudflare ou pagar por um modelo.

1. Envie uma mensagem. A resposta identifica claramente a simulação.
2. Busque o texto em **Find original messages**.
3. Clique em **Try a demo approval**. Confira o código e os argumentos exatos em **Approvals**.
4. Aprove ou rejeite. O resultado fica salvo e, quando concluído, volta para a conversa.
5. Recarregue a página ou reinicie o servidor local. A sessão mantém seu endereço e seus registros em `.wrangler/`.
6. Use **Export session data** para baixar as mensagens, a visão atual da memória e os registros de ações. O arquivo permite consulta e verificação local; ele não restaura a execução. [Conteúdo, limites e verificador](./docs/session-export.md).
7. Espere o trabalho ativo terminar e selecione **Create checkpoint** em **Session recovery**. Aguarde **Checkpoint saved**, continue a conversa e use **Restore…** para voltar ao estado salvo. A confirmação explica o alcance: notas já criadas e consumo registrado continuam preservados. [Procedimento e limites](./docs/coordinated-recovery.md).

As novas URLs começam com `#c1:`. URLs antigas continuam abrindo as sessões originais; use **New session** para experimentar checkpoints. Eles restauram a conversa dentro do mesmo Durable Object, sem cobrir exclusão desse objeto ou perda da conta. Há até três checkpoints e oito admissões de restauração por sessão, sem apagar automaticamente as cópias anteriores.

Fechar a página não cancela o trabalho. Parar o servidor local pausa o processamento até a próxima inicialização. Aprovações expiram após uma hora. Um resultado **unknown** significa que houve uma interrupção sem confirmação suficiente: a interface permite inspecionar o registro, sem repetir automaticamente a ação.

## Exportar os dados para consulta

O botão **Export session data** funciona no ambiente local e na sessão autenticada da Cloudflare. Baixa todas as páginas do histórico textual retido, a memória atual e os registros e resultados retidos das ações. Aguarde o processamento terminar; aprovações pendentes permanecem pendentes. O arquivo contém dados privados e não é criptografado.

Para conferir sua integridade sem login, servidor ou Git:

```sh
npm run export:verify -- /caminho/absoluto/para/arquivo.json
```

Esse arquivo serve para leitura e inspeção. Os checkpoints restauram novas sessões; a cópia offline completa usa o procedimento abaixo. A qualificação hospedada dos checkpoints ainda está pendente.

## Guardar uma cópia local e restaurar

Pare o servidor com **Ctrl+C** e execute:

```sh
npm run state -- backup --to .local-backups/demo
npm run state -- verify .local-backups/demo
npm run state -- restore .local-backups/demo --to .local-restores/demo
npm run dev -- --persist-to .local-restores/demo
```

Abra a mesma URL de sessão, incluindo o trecho depois de `#`. A cópia inclui a memória e os registros das aprovações; a restauração usa uma pasta nova e preserva os dados originais. Esse caminho local exige macOS/Linux com `lsof`, a mesma configuração e as mesmas versões do runtime. Os backups contêm dados privados e não são criptografados. [Procedimento completo e recuperação de interrupções](./docs/local-recovery.md).

## Atualizar sem perder a sessão

A rota revisada **0.1.0-dev.4 → 0.1.0-dev.5** usa uma cópia separada e mantém conversas, memória, ações concluídas e aprovações pendentes. Guarde a instalação antiga e siga o [guia de atualização local](./docs/local-upgrades.md). O comando confere o conteúdo exato das duas versões; não basta mudar o número da versão. Instalações anteriores seguem as rotas preservadas em sequência: dev.0 → dev.1 → dev.2 → dev.3 → dev.4 → dev.5.

## Quando hospedar na Cloudflare

Você pode desenvolver e testar localmente antes de entrar na conta ou contratar um plano. A aplicação completa hospedada exige **Workers Paid**, a partir de **US$ 5 por conta/mês**, porque o Code Mode usa Dynamic Workers. Esse valor é a base do plano, não um teto de cobrança: consumo excedente e inferência de modelos têm suas próprias regras.

Dynamic Workers executa o código do agente em um ambiente isolado. Durable Objects preserva o estado, e Access controla quem entra. A aplicação reúne essas peças com Pi e OptChat; a assinatura não adiciona conectores de e-mail, calendário ou outros serviços. Por enquanto, o conector qualificado cria notas locais da sessão.

É possível usar sua conta Cloudflare existente e começar com um endereço `workers.dev` protegido por Access, sem comprar outro domínio. Siga o [passo a passo do ambiente privado](./docs/staging.md) e consulte os [requisitos e preços oficiais](./docs/deployment.md). O primeiro login no aplicativo é separado do login no painel administrativo da Cloudflare; na configuração demonstrada, ele usa um código enviado ao e-mail autorizado.

## Já tenho Pi

Para adicionar **somente a memória** ao Pi existente:

```sh
pi install https://github.com/kevinqz/optchat-durable@v0.4.0
```

O [OptChat Durable](https://github.com/kevinqz/optchat-durable) continua separado e também oferece o SDK para outros hosts. Este repositório é a aplicação web complementar. Ele não substitui seu Pi nem transfere seu login de ChatGPT ou Claude para a nuvem. Modelos hospedados exigem configuração própria.

**Modelo real:** depois de configurar Workers AI, escolha o modelo em **Model for the next session** e selecione **New session**. As conversas de demonstração continuam disponíveis. Cada conversa guarda seu modelo e limite de chamadas, incluindo resumos de memória e tentativas que falhem; reiniciar não repõe esse limite. Consulte a [configuração e os limites de consumo](./docs/models.md). A integração hospedada com modelo real ainda precisa de verificação funcional.

## Documentação

- [README completo e organização](./README.md)
- [Arquitetura e garantias](./docs/architecture.md)
- [Implantação e operação](./docs/deployment.md)
- [Exportação de dados e verificação offline](./docs/session-export.md)
- [Checkpoints e restauração da sessão](./docs/coordinated-recovery.md)
- [Atualização local entre versões](./docs/local-upgrades.md)
- [Atualização hospedada e reinício da demonstração](./docs/hosted-recovery.md)
- [Verificações e limites](./docs/validation.md)
- [Roadmap](./docs/roadmap.md)

Créditos: **Victor Taelin** pelo desenho OptChat/UniiChat; **Mario Zechner, Earendil Works e colaboradores** pelo Pi; **Cloudflare e colaboradores** pelos componentes de hospedagem e execução; **Kevin Saltarelli** pela integração independente. [Fontes e licenças](./CREDITS.md).
