# Pi Durable Agent

Aplicação independente e aberta que reúne **Pi Durable**, a memória do **OptChat Durable** e ferramentas do **Cloudflare Code Mode**.

**Prévia de desenvolvimento.** A demonstração local usa os runtimes reais com respostas de modelo simuladas. O único conector implementado cria notas locais da sessão. Ainda falta qualificar a implantação Cloudflare, modelos reais, restauração coordenada e operação em produção.

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

Fechar a página não cancela o trabalho. Parar o servidor local pausa o processamento até a próxima inicialização. Aprovações expiram após uma hora. Um resultado **unknown** significa que houve uma interrupção sem confirmação suficiente: a interface permite inspecionar o registro, sem repetir automaticamente a ação.

## Já tenho Pi

Para adicionar **somente a memória** ao Pi existente:

```sh
pi install https://github.com/kevinqz/optchat-durable@v0.4.0
```

O [OptChat Durable](https://github.com/kevinqz/optchat-durable) continua separado e também oferece o SDK para outros hosts. Este repositório é a aplicação web complementar. Ele não substitui seu Pi nem transfere seu login de ChatGPT ou Claude para a nuvem. Modelos hospedados exigem configuração própria.

## Documentação

- [README completo e organização](./README.md)
- [Arquitetura e garantias](./docs/architecture.md)
- [Implantação e operação](./docs/deployment.md)
- [Verificações e limites](./docs/validation.md)
- [Roadmap](./docs/roadmap.md)

Créditos: **Victor Taelin** pelo desenho OptChat/UniiChat; **Mario Zechner, Earendil Works e colaboradores** pelo Pi; **Cloudflare e colaboradores** pelos componentes de hospedagem e execução; **Kevin Saltarelli** pela integração independente. [Fontes e licenças](./CREDITS.md).
