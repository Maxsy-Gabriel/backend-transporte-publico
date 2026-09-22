Claude, precisamos desenvolver este projeto seguindo **rigorosamente** as especificações do arquivo:

**@AV-09-TRANSPORTE-ESCOLAR.md**

Esse arquivo é a **fonte principal de requisitos do projeto**. Antes de implementar qualquer coisa, leia e compreenda todo o conteúdo dele. Não faça suposições que contradigam os requisitos.

Este é um projeto que será apresentado para um **grupo técnico**, portanto ele precisa ser desenvolvido com organização, consistência, segurança, capacidade de manutenção e principalmente estar preparado para perguntas técnicas sobre as decisões tomadas.

## 1. REGRA PRINCIPAL: REQUISITOS SÃO PRIORIDADE MÁXIMA

Todos os requisitos presentes em `@AV-09-TRANSPORTE-ESCOLAR.md` devem ser tratados como obrigatórios.

Nunca ignore, simplifique, substitua ou pule um requisito sem antes verificar se existe realmente uma justificativa técnica para isso.

Caso alguma orientação minha pareça entrar em conflito com o arquivo de requisitos, ou caso exista uma ambiguidade importante que possa alterar a implementação, **pare e me questione antes de tomar uma decisão que possa comprometer o requisito**.

Não faça mudanças arbitrárias apenas porque uma solução diferente parece mais simples.

Quando houver liberdade técnica, escolha uma solução coerente, justificável e adequada ao nível do projeto.

---

# 2. PRIMEIRO: ENTENDER E PLANEJAR

Antes de começar a escrever código, faça uma análise completa do projeto.

Crie internamente um **plano de execução detalhado**, que servirá como seu próprio guia de desenvolvimento.

Esse plano deve organizar o projeto em etapas, por exemplo:

1. análise dos requisitos;
2. definição da arquitetura;
3. estrutura inicial do projeto;
4. configuração das dependências;
5. implementação das funcionalidades essenciais;
6. banco de dados;
7. autenticação e autorização;
8. validações;
9. tratamento de erros;
10. logs;
11. documentação;
12. Swagger/OpenAPI;
13. Docker;
14. testes;
15. validação final;
16. revisão completa do projeto.

A ordem pode ser adaptada conforme a arquitetura real definida no projeto, mas **não pule etapas importantes**.

O plano deve servir como checklist durante o desenvolvimento.

Sempre que uma etapa for concluída, verifique se ela realmente atende aos requisitos antes de avançar.

---

# 3. FAÇA O ESSENCIAL PRIMEIRO

A prioridade deve ser:

**1. requisitos obrigatórios → 2. funcionamento correto → 3. validação/testes → 4. segurança → 5. documentação → 6. melhorias e refinamentos**

Não comece adicionando funcionalidades secundárias enquanto as funcionalidades fundamentais ainda não estiverem funcionando.

Não pule etapas para "voltar depois".

A primeira versão funcional deve conter o essencial previsto no documento e estar funcionando corretamente antes de partirmos para melhorias.

---

# 4. IMPLEMENTE COM RACIOCÍNIO TÉCNICO

Não apenas escreva código.

Para cada parte importante do projeto, pense antecipadamente:

- o que pode dar errado;
- quais entradas podem ser inválidas;
- quais dados podem faltar;
- quais combinações de dados podem gerar inconsistências;
- quais endpoints podem receber requisições indevidas;
- quais regras de negócio podem ser quebradas;
- onde podem ocorrer exceções;
- como o sistema deve responder a erros;
- o que aconteceria em produção;
- quais problemas poderiam aparecer ao executar o projeto em outra máquina.

Sempre que possível, antecipe os problemas **antes que eles aconteçam**.

A implementação deve tentar ser robusta contra erros previsíveis.

---

# 5. VALIDE TODA A LÓGICA POSSÍVEL

Essa é uma regra extremamente importante:

**Sempre tente validar toda a lógica possível do projeto.**

Não teste apenas o "caminho feliz".

Para cada funcionalidade, procure testar:

### Casos normais
Dados corretos, completos e esperados.

### Casos inválidos
Dados incorretos, incompletos, vazios ou fora das regras.

### Casos extremos
Valores muito grandes, muito pequenos, limites permitidos, listas vazias, IDs inexistentes etc.

### Casos inesperados
Requisições repetidas, recursos inexistentes, conflitos, dados duplicados ou situações que possam quebrar a lógica.

### Erros técnicos
Banco indisponível, variável de ambiente ausente, token inválido, token expirado, rota inexistente, erro interno, serviço indisponível etc.

Para cada funcionalidade importante, pense:

**"Como alguém conseguiria quebrar essa funcionalidade?"**

Depois tente verificar e corrigir esses cenários.

---

# 6. TESTE O PRÓPRIO PROJETO DURANTE O DESENVOLVIMENTO

Não espere terminar todo o projeto para testar.

Sempre que uma etapa importante for implementada:

1. execute;
2. teste;
3. procure erros;
4. corrija;
5. teste novamente;
6. só então avance.

Sempre que possível, valide também a integração entre as diferentes partes do sistema.

Não considere uma funcionalidade concluída apenas porque o código parece correto.

**Código que não foi validado não deve ser considerado concluído.**

---

# 7. TESTE TAMBÉM OS PASSOS DO README

Isso é obrigatório.

O `README.md` deverá explicar detalhadamente como configurar e executar o projeto em **outra máquina**, partindo praticamente do zero.

Depois que o README estiver pronto, **simule os passos descritos nele e teste-os você mesmo**.

A ideia é verificar:

> "Uma pessoa que nunca viu esse projeto conseguiria seguir exatamente este README e fazer o sistema funcionar?"

Valide especialmente:

- instalação das dependências;
- configuração das variáveis de ambiente;
- banco de dados;
- migrations, seeds ou scripts necessários;
- execução da aplicação;
- execução dos testes;
- autenticação;
- Swagger;
- Docker;
- comandos necessários;
- portas utilizadas;
- serviços externos;
- qualquer configuração obrigatória.

Se o README disser para executar um comando, tente executar esse comando.

Se disser para criar um arquivo, verifique se o procedimento está correto.

Se disser que determinado serviço precisa estar funcionando, valide isso.

**O README deve ser testado como se outra pessoa estivesse configurando o projeto pela primeira vez.**

---

# 8. JWT E AMBIENTES

A autenticação com JWT deve ser pensada corretamente para diferentes ambientes.

Considere pelo menos:

- desenvolvimento;
- testes;
- produção.

Não deixe segredos, chaves privadas ou credenciais diretamente no código.

Utilize variáveis de ambiente e uma configuração apropriada para cada ambiente.

Analise também:

- segredo usado para assinatura;
- expiração do token;
- configuração de desenvolvimento;
- configuração de produção;
- tratamento de token inválido;
- token expirado;
- autorização baseada em permissões/roles, caso o projeto exija;
- proteção das rotas;
- exposição acidental de informações sensíveis.

Não reutilize de forma inadequada configurações de desenvolvimento em produção.

---

# 9. LOGS E SEGURANÇA

O projeto deve possuir logs úteis para diagnóstico e acompanhamento da aplicação.

Porém:

**NUNCA coloque dados sensíveis explicitamente nos logs.**

Tenha atenção especial com:

- senhas;
- tokens JWT;
- secrets;
- credenciais;
- chaves;
- dados pessoais desnecessários;
- informações de autenticação;
- dados sensíveis enviados nas requisições.

Os logs devem ajudar a descobrir o que aconteceu sem transformar o sistema em uma fonte de vazamento de informações.

Sempre que apropriado, registre informações como:

- método HTTP;
- rota;
- status da resposta;
- timestamp;
- identificadores não sensíveis;
- contexto do erro;
- informações úteis para debugging.

Mas jamais registre indiscriminadamente o conteúdo completo de requisições contendo dados sensíveis.

---

# 10. SWAGGER / OPENAPI

O projeto deve possuir documentação da API utilizando **Swagger/OpenAPI**, da forma tecnicamente mais adequada à stack utilizada.

Faça isso de alguma maneira, desde que a solução seja funcional e coerente com o projeto.

A documentação deve ser útil para alguém que precise entender e testar a API.

Documente, sempre que aplicável:

- endpoints;
- métodos HTTP;
- parâmetros;
- query parameters;
- request body;
- respostas;
- códigos HTTP;
- autenticação;
- JWT/Bearer;
- schemas;
- exemplos;
- erros possíveis.

Depois de implementar o Swagger, **abra e teste a documentação**.

Não considere a tarefa concluída apenas porque o Swagger foi configurado sem verificar se os endpoints realmente aparecem e podem ser utilizados corretamente.

---

# 11. PESQUISAR E AVALIAR DOCKER

Pesquise como Docker pode ser utilizado nesta aplicação.

A análise deve considerar a arquitetura real do projeto e não simplesmente adicionar Docker por adicionar.

Avalie como containerizar:

- aplicação;
- banco de dados;
- serviços auxiliares, caso existam.

Analise também:

- Dockerfile;
- `.dockerignore`;
- Docker Compose, se fizer sentido;
- variáveis de ambiente;
- volumes;
- comunicação entre containers;
- portas;
- persistência do banco;
- desenvolvimento local;
- execução do projeto em outra máquina.

Se Docker fizer sentido para o projeto, implemente uma configuração funcional.

Depois, **teste a configuração criada**.

O objetivo não é apenas ter arquivos Docker, mas conseguir realmente executar o projeto por meio deles.

---

# 12. TRATAMENTO DE ERROS

Tenha tratamento consistente de erros.

Não deixe exceções importantes simplesmente quebrarem a aplicação.

Verifique especialmente:

- entradas inválidas;
- recursos inexistentes;
- erros de banco;
- erros de autenticação;
- erros de autorização;
- conflitos;
- erros inesperados;
- falhas de serviços externos;
- configurações ausentes.

As respostas da API devem ser coerentes e fornecer informações úteis sem expor detalhes internos desnecessários.

Evite retornar stack traces, secrets ou informações internas para o cliente em produção.

---

# 13. BANCO E INTEGRIDADE DOS DADOS

Analise cuidadosamente as regras relacionadas ao banco de dados.

Verifique:

- relacionamentos;
- chaves;
- constraints;
- valores obrigatórios;
- unicidade;
- integridade referencial;
- regras de negócio;
- consistência dos dados;
- operações inválidas;
- transações, quando necessárias.

Não confie somente nas validações do frontend.

As regras importantes também devem ser protegidas no backend.

---

# 14. SEGURANÇA GERAL

Durante todo o desenvolvimento, procure identificar problemas de segurança.

Pense especialmente em:

- autenticação;
- autorização;
- JWT;
- exposição de secrets;
- validação de entrada;
- injeções;
- acesso indevido a recursos;
- exposição excessiva de dados;
- erros excessivamente detalhados;
- configurações inseguras;
- CORS;
- headers;
- controle de acesso;
- manipulação de arquivos, caso exista;
- dependências vulneráveis, quando possível verificar.

Não tente apenas fazer o sistema funcionar.

Tente entender **como ele poderia ser utilizado de maneira incorreta ou maliciosa** e reduza esses riscos quando estiverem dentro do escopo do projeto.

---

# 15. DOCUMENTAÇÃO MUITO BEM EXPLICADA

O `README.md` deve ser extremamente bem estruturado e detalhado.

Ele deve permitir que outra pessoa, em outra máquina, consiga entender e executar o projeto.

Inclua, conforme aplicável:

## Sobre o projeto
Explique claramente o que é o sistema e qual problema ele resolve.

## Tecnologias
Liste e explique as principais tecnologias utilizadas.

## Arquitetura
Explique de maneira clara como as partes do sistema se relacionam.

## Pré-requisitos
Liste tudo que precisa estar instalado.

## Instalação
Explique passo a passo.

## Configuração
Explique todas as variáveis de ambiente necessárias.

Nunca coloque secrets reais no README.

Use `.env.example` quando apropriado.

## Banco de dados
Explique como configurar o banco, migrations, seeds etc.

## Execução
Explique os comandos necessários para executar o sistema.

## Testes
Explique como executar os testes.

## Swagger
Explique onde acessar a documentação da API.

## Docker
Explique como executar utilizando Docker, caso implementado.

## Autenticação
Explique como funciona o JWT e como autenticar requisições.

## Endpoints
Apresente e explique os principais endpoints.

## Fluxos importantes
Explique os principais fluxos do sistema.

## Problemas comuns
Inclua erros comuns de configuração e como solucioná-los.

## Estrutura de pastas
Explique a organização do projeto.

O README deve responder claramente perguntas como:

> "Acabei de clonar esse projeto. O que faço agora?"

e

> "Por que essa configuração existe?"

---

# 16. NÃO FINJA QUE TESTOU

Nunca diga que algo foi testado se realmente não foi.

Diferencie claramente:

- código implementado;
- código revisado;
- código executado;
- teste realizado;
- teste que não pôde ser realizado.

Não invente resultados.

Se alguma validação não puder ser executada por uma limitação do ambiente, deixe isso explícito.

---

# 17. CHECKPOINTS

Ao terminar cada grande etapa, faça uma revisão contra o arquivo `@AV-09-TRANSPORTE-ESCOLAR.md`.

Pergunte internamente:

- Todos os requisitos desta etapa foram atendidos?
- Existe algum requisito parcialmente implementado?
- Existe algum comportamento não validado?
- Existe algum cenário de erro que ainda não foi considerado?
- Alguma alteração introduziu regressão?
- A implementação continua coerente com os requisitos originais?

Somente avance quando a etapa estiver realmente consistente.

---

# 18. REVISÃO FINAL OBRIGATÓRIA

Quando o projeto estiver aparentemente concluído, **não encerre imediatamente**.

Faça uma revisão final completa.

Revise:

### Requisitos
Compare novamente o projeto inteiro com `@AV-09-TRANSPORTE-ESCOLAR.md`.

### Código
Procure erros, inconsistências, duplicações desnecessárias e possíveis melhorias.

### Lógica
Tente encontrar situações que possam quebrar o sistema.

### Segurança
Revise autenticação, autorização, JWT, secrets, logs e validações.

### API
Teste os endpoints e seus diferentes cenários.

### Banco
Verifique integridade e comportamentos inválidos.

### Swagger
Abra e valide a documentação.

### Docker
Execute e valide a configuração, caso tenha sido implementada.

### README
Siga os passos do README desde o início como se estivesse em outra máquina.

### Testes
Execute todos os testes disponíveis e avalie se existem lacunas importantes.

---

# 19. ORDEM DE PRIORIDADE

Sempre utilize esta ordem para tomar decisões:

**REQUISITOS → FUNCIONALIDADE → CORREÇÃO → VALIDAÇÃO → SEGURANÇA → DOCUMENTAÇÃO → REFINAMENTO**

Não sacrifique uma etapa essencial para acelerar o desenvolvimento.

Não pule etapas.

Não considere uma tarefa concluída apenas porque "parece estar funcionando".

---

# 20. FORMA DE TRABALHAR

Quero que você trabalhe como um desenvolvedor cuidadoso e crítico em relação ao próprio código.

Não seja apenas um gerador de código.

Antes de implementar, pense.

Durante a implementação, valide.

Depois de implementar, teste.

Depois de testar, tente quebrar.

Depois de corrigir, teste novamente.

Sempre que fizer uma alteração relevante, considere quais outras partes podem ter sido afetadas.

Evite mudanças desnecessárias em partes que já estejam corretas.

Quando existir mais de uma solução técnica possível, escolha uma solução coerente com os requisitos e explique brevemente a decisão quando isso for relevante para a apresentação técnica.

---

# 21. OBJETIVO FINAL

O objetivo não é apenas entregar um projeto que "funciona".

O objetivo é entregar um projeto que possa ser analisado por pessoas técnicas e que tenha respostas claras para perguntas como:

- Por que essa arquitetura foi escolhida?
- Por que essa tecnologia foi utilizada?
- Como a autenticação funciona?
- Como o JWT é tratado em diferentes ambientes?
- Como os erros são tratados?
- Como os logs funcionam sem expor dados sensíveis?
- Como a API pode ser testada?
- Como o Swagger foi implementado?
- Como o banco é protegido contra dados inválidos?
- Como o projeto funciona em outra máquina?
- Como executar com Docker?
- O que acontece quando algo dá errado?
- Quais validações foram realizadas?
- Quais foram as decisões técnicas tomadas?

A implementação deve ser suficientemente organizada e documentada para permitir responder essas perguntas com base no próprio projeto.

---

# REGRA FINAL

**FAÇA O ESSENCIAL PRIMEIRO. NÃO PULE ETAPAS. NÃO ASSUMA QUE ESTÁ FUNCIONANDO. TESTE MUITO BEM.**

E principalmente:

**ANTES DE CONSIDERAR O PROJETO CONCLUÍDO, TESTE O PRÓPRIO README, VALIDE O MÁXIMO DE CENÁRIOS POSSÍVEIS E FAÇA UMA REVISÃO FINAL CONTRA TODOS OS REQUISITOS DO `@AV-09-TRANSPORTE-ESCOLAR.md`.**