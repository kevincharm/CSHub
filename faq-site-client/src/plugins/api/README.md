Websockets are used to create a connection with the backend server. I downloaded the source code of the Vue-Socket.io plugin, converted it to TypeScript and wrote my own wrapper around it to support a few things:
- Typed requests (you create a request by creating an instance of a class and passing that into the wrapper. Then the backend will ALWAYS have the correct types, as it also uses that class)
- Input from server, with websockets it is possible to get data from the server without having sent a request. This needs to be handled. The wrapper will actually handle this correctly, you can create observers (RXJs) to listen to those inputs.