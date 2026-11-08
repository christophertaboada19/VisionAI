| CARRERA | :   | INTELIGENCIA ARTIFICIAL IV SEMESTRE |
| ------- | --- | ----------------------------------- |
| CURSO   | :   | MACHINE LEARNING Y DEEP LEARNING    |
Instructor Mg. Arturo Huapaya H.
Escuela de Tecnologías de la Información

Objetivo del curso
| Al finalizar | el módulo    | formativo, |         | el aprendiz     | tendrá      | un    |
| ------------ | ------------ | ---------- | ------- | --------------- | ----------- | ----- |
| comprensión  | sólida       | y práctica | de      | los fundamentos | esenciales  |       |
| del Machine  | Learning     | y          | Deep    | Learning,       | así como    | las   |
| habilidades  | necesarias   | para       | aplicar | estos           | conceptos   | en la |
| resolución   | de problemas | del        | mundo   | real mediante   | el lenguaje |       |
Python
2
Escuela de Tecnologías de la Información www.senati.edu.pe

Sesión 03
3
Escuela de Tecnologías de la Información www.senati.edu.pe

Objetivo de la Sesión
| Al finalizar  | la             | sesión, | el aprendiz  |        | será capaz    | de          | definir | una      | red   |
| ------------- | -------------- | ------- | ------------ | ------ | ------------- | ----------- | ------- | -------- | ----- |
| neuronal      | artificial,    |         | describir    | su     | estructura,   | identificar |         | los      | tipos |
| de redes      | neuronales     |         | artificiales |        | y crear       | una         | red     | neuronal |       |
| básica        | con TensorFlow |         | y            | Keras, | interpretando |             | el      | proceso  | de    |
| entrenamiento |                | y los   | resultados   |        | obtenidos.    |             |         |          |       |
4
Escuela de Tecnologías de la Información www.senati.edu.pe

Temas
| • Define   | la     | red neuronal  | artificial | y su | importancia  |
| ---------- | ------ | ------------- | ---------- | ---- | ------------ |
| en         | al IA. |               |            |      |              |
| • Describe |        | la estructura | de         | una  | red neuronal |
artificial.
| • Identifica |     | los tipos | de  | redes | neuronales |
| ------------ | --- | --------- | --- | ----- | ---------- |
artificiales.
| • Crea | una | red neuronal | con Tensorflow |     | y Keras |
| ------ | --- | ------------ | -------------- | --- | ------- |
5
Escuela de Tecnologías de la Información www.senati.edu.pe

Charla de 5 minutos
| Evaluación | de riesgos | en el puesto | de trabajo |
| ---------- | ---------- | ------------ | ---------- |
6
Escuela de Tecnologías de la Información

7
Escuela de Tecnologías de la Información

Nociones previas
8
Escuela de Tecnologías de la Información www.senati.edu.pe

Caso: Detección de defectos en una fábrica de alimentos
• Una empresa de producción de alimentos recibe diariamente miles de envases. Algunos
presentan defectos que pueden afectar la calidad del producto:
• Tapas mal colocadas.
• Etiquetas torcidas.
• Envases deformados.
• Envases correctamente terminados.
• Actualmente, dos trabajadores inspeccionan visualmente los productos. El proceso es
lento, depende de la atención del trabajador y algunos defectos pasan inadvertidos.
• La empresa quiere implementar un sistema de inteligencia artificial que analice
fotografías de los envases y determine si cada producto presenta un defecto.
9
Escuela de Tecnologías de la Información www.senati.edu.pe

Caso: Detección de defectos en una fábrica de alimentos
• Datos disponibles
10
Escuela de Tecnologías de la Información www.senati.edu.pe

Caso: Detección de defectos en una fábrica de alimentos
Identificación del problema de inteligencia artificial
• ¿Qué tipo de información recibe el modelo?
• ¿Qué resultado debe producir?
• ¿Qué tipo de Aprendizaje deberías Utilizar y Porque?
• ¿Qué tipo de Algoritmo?
• ¿Qué algoritmo utilizarías y porque?
• ¿Cual Seria la respuesta o salida que debería dar la predicción?
11
Escuela de Tecnologías de la Información www.senati.edu.pe

Caso: Detección de defectos en una fábrica de alimentos
Identificación del problema de inteligencia artificial
• Tipo de tarea: clasificación de imágenes.
• Tipo de aprendizaje: supervisado, si se dispone de imágenes etiquetadas.
• Objetivo: aprender patrones visuales que permitan clasificar nuevas fotografías.
Entrada: Modelo Salida
• Fotografías de envases • Red neuronal • Defecto / Sin defecto
12
Escuela de Tecnologías de la Información www.senati.edu.pe

Desarrollo
13
Escuela de Tecnologías de la Información www.senati.edu.pe

¿Qué es una red neuronal artificial?
Una red neuronal artificial (RNA) es un modelo computacional compuesto por unidades de
procesamiento conectadas entre sí, que aprende relaciones y patrones a partir de datos
mediante el ajuste de parámetros.
Sus principales elementos son:
•
Neuronas artificiales.
•
Pesos y sesgos.
•
Funciones de activación.
•
Capas de entrada, ocultas y salida.
•
Un procedimiento de entrenamiento.
14
Escuela de Tecnologías de la Información www.senati.edu.pe

Estructura de una red neuronal artificial
CAPAS OCULTAS:
Transforman la información mediante
operaciones matemáticas.
CAPA DE ENTRADA CAPA DE SALIDA:
Recibe las características Genera la
de los datos. predicción.
CONEXIONES
transportan valores entre neuronas
mediante pesos.
15
Escuela de Tecnologías de la Información www.senati.edu.pe

¿Cómo funciona una neurona artificial?
Una neurona calcula una combinación ponderada de sus entradas y aplica una función de activación
16
Escuela de Tecnologías de la Información www.senati.edu.pe

Funciones de activación
17
Escuela de Tecnologías de la Información www.senati.edu.pe

Funciones de activación
1. ReLU (El motor de las capas internas)
• Se usa únicamente en las capas ocultas (intermedias). Es el estándar de la industria porque es rápida de calcular y
evita que la red se quede "congelada" sin aprender (gradiente desvanecido).
• Usos puntuales / predicción:
• No se usa en la capa de salida
• Si estás diseñando las capas del medio de cualquier red moderna (computación visual, texto, etc.), la
respuesta por defecto siempre es ReLU.
18
Escuela de Tecnologías de la Información www.senati.edu.pe

Funciones de activación
1. ReLU (El motor de las capas internas)
19
Escuela de Tecnologías de la Información www.senati.edu.pe

Funciones de activación
2. Sigmoid (El interruptor de Sí o No)
• Se usa casi exclusivamente en la capa de salida cuando el modelo debe tomar una decisión de tipo "A o B"
(excluyente). Transforma el número final en una probabilidad entre 0% y 100%:
• Ejemplo de predicción
• Predicción Binaria (Detección de Spam): Clasificar si un correo entrante es Spam (1) o No Spam (0).
• Diagnóstico Médico: Determinar si una radiografía muestra una enfermedad (1) o está sano (0).
20
Escuela de Tecnologías de la Información www.senati.edu.pe

Funciones de activación
2. Sigmoid (El interruptor de Sí o No)
Aprobado = 1
Estado = “Sin_Defecto” = 1
(Probabilidad=90%)
Aprobado = 0
Estado = “Con_Defecto” = 0
(Probabilidad=10%)
21
Escuela de Tecnologías de la Información www.senati.edu.pe

Funciones de activación
3. Softmax (El repartidor de probabilidades)
• Se usa en la capa de salida cuando el modelo debe elegir una sola opción entre tres o más categorías posibles. Lo
que hace es asegurarse de que las probabilidades de todas las opciones sumen exactamente 100%.
• Ejemplo de predicción
• Clasificación de Animales (Multiclase): Identificar si una foto es un Perro, un Gato, un Pájaro o un Pez (el
modelo te dirá: 80% perro, 15% gato, etc.).
• Reconocimiento de Dígitos: Leer un número escrito a mano y determinar si es un 0, 1, 2, 3, 4, 5, 6, 7, 8 o 9.
22
Escuela de Tecnologías de la Información www.senati.edu.pe

Funciones de activación
3. Softmax (El repartidor de probabilidades)
23
Escuela de Tecnologías de la Información www.senati.edu.pe

Funciones de activación
4. GELU (Gaussian Error Linear Unit - El suavizador moderno)
• Se usa ampliamente en las capas ocultas de modelos avanzados de procesamiento de lenguaje natural y arquitecturas
modernas basadas en Transformers (como BERT o GPT). A diferencia de las funciones tradicionales, GELU pondera
las entradas según su valor probabilístico mediante una distribución gaussiana, permitiendo que pequeños valores
negativos pasen de forma controlada y suavizando las transiciones para mejorar el flujo del gradiente..
• Ejemplo de predicción
• Modelos de Lenguaje y Análisis de Sentimiento (BERT): Procesar una oración o reseña palabra por palabra para
analizar el contexto bidireccional y determinar si el tono general del texto es altamente negativo, neutro o
positivo.
• Traducción Automática y Generación de Texto (GPT): Procesar secuencias complejas de palabras para predecir
el siguiente token en una frase o traducir texto de forma fluida manteniendo la coherencia semántica.
24
Escuela de Tecnologías de la Información www.senati.edu.pe

Funciones de activación
4. GELU (Gaussian Error Linear Unit - El suavizador moderno)
25
Escuela de Tecnologías de la Información www.senati.edu.pe

Tipos de Redes Neuronales
26
Escuela de Tecnologías de la Información www.senati.edu.pe

Perceptrón simple
Es la forma más básica e histórica de una red neuronal. Consta de una sola neurona que recibe entradas,
las multiplica por pesos, las suma y pasa el resultado por una función de activación (generalmente un
escalón que da 0 o 1).
• ¿Cuándo se usa? Solo para clasificación lineal sencilla, es decir, problemas donde los datos se pueden
dividir perfectamente con una línea recta.
• Ejemplos de predicción:
o Comportamiento de compuertas lógicas: Decidir si un circuito se enciende o se apaga (como las
funciones lógicas AND / OR).
o Filtro básico de aprobación: Decidir si un cliente califica para un crédito usando solo dos variables
fijas muy claras (ej. ingresos mínimos e historial limpio).
27
Escuela de Tecnologías de la Información www.senati.edu.pe

Perceptrón simple
28
Escuela de Tecnologías de la Información www.senati.edu.pe

MLP o Red Densa Multicapa (Multi-Layer Perceptron)
Es una red donde las neuronas se organizan en filas (capas) y todas las neuronas de una capa se conectan
con todas las de la siguiente. Combina múltiples neuronas para aprender curvas y patrones complejos.
• ¿Cuándo se usa? Es el estándar para datos tabulares (tablas de Excel, bases de datos estructuradas) y
relaciones que no son líneas rectas (no lineales).
• Ejemplos de predicción:
o Precio de viviendas: Predecir el costo de una casa basándose en una tabla con columnas como:
metros cuadrados, número de habitaciones y zona.
o Churn de clientes: Analizar los datos de perfil de un usuario (edad, meses de contrato, quejas)
para predecir si va a cancelar su suscripción el próximo mes.
29
Escuela de Tecnologías de la Información www.senati.edu.pe

MLP o Red Densa Multicapa (Multi-Layer Perceptron)
30
Escuela de Tecnologías de la Información www.senati.edu.pe

CNN (Red Neuronal Convolucional)
Una red especializada en escanear información en pedazos pequeños mediante filtros (convoluciones). En
lugar de mirar cada píxel suelto, detecta bordes, formas, texturas y patrones visuales.
• ¿Cuándo se usa? Para imágenes, videos y cualquier dato que tenga una estructura espacial (donde la
cercanía de los puntos importa).
• Ejemplos de predicción:
o Diagnóstico por imágenes: Analizar una radiografía de tórax para identificar si hay presencia de
neumonía.
o Vehículos autónomos: Escanear el video de una cámara en tiempo real para detectar peatones,
señales de tráfico y carriles.).
31
Escuela de Tecnologías de la Información www.senati.edu.pe

CNN (Red Neuronal Convolucional)
32
Escuela de Tecnologías de la Información www.senati.edu.pe

RNN (Red Neuronal Recurrente)
Una red que tiene memoria a corto plazo. A diferencia de las anteriores, procesa la información paso a paso
(en orden) y recuerda lo que vio en el paso anterior para entender lo que viene después.
• ¿Cuándo se usa? Para secuencias y datos con dependencias temporales, donde el orden de los
factores altera totalmente el significado.
• Ejemplos de predicción:
o Predicción de texto (Autocompletar): Adivinar la siguiente palabra que va a escribir un usuario en
su teclado (ej. si escribe "Buenos...", la red predice "días").
o Análisis de señales de audio: Identificar comandos de voz simples basándose en la onda de
sonido recibida milisegundo a milisegundo
33
Escuela de Tecnologías de la Información www.senati.edu.pe

RNN (Red Neuronal Recurrente)
34
Escuela de Tecnologías de la Información www.senati.edu.pe

LSTM y GRU (Variantes avanzadas de RNN)
Son evoluciones de la RNN tradicional, pero equipadas con "puertas matemáticas" especiales que les
permiten tener memoria a largo plazo. Deciden qué información del pasado olvidar y cuál conservar durante
mucho tiempo.
• ¿Cuándo se usa? Para secuencias largas con dependencias a lo largo del tiempo, donde las RNN
normales fallan porque olvidan rápido el inicio de la secuencia.
• Ejemplos de predicción:
o Mercado financiero (Bolsa): Predecir el precio de una acción mañana analizando las tendencias e
historiales de los últimos 6 meses.
o Traducción de textos largos: Traducir un párrafo entero manteniendo el contexto y el género de
los sujetos mencionados al inicio del texto.
35
Escuela de Tecnologías de la Información www.senati.edu.pe

LSTM y GRU (Variantes avanzadas de RNN)
36
Escuela de Tecnologías de la Información www.senati.edu.pe

Transformer
La arquitectura moderna más potente. En lugar de procesar los datos uno por uno en orden (como las RNN),
los procesa todos a la vez en paralelo y usa un mecanismo llamado "Atención" para conectar palabras o
datos clave sin importar qué tan lejos estén. Es el motor detrás de GPT y Gemini.
• ¿Cuándo se usa? Para lenguaje humano, secuencias masivas y modelos modernos multimedia (texto,
imagen, audio al mismo tiempo).
• Ejemplos de predicción:
o Generación de respuestas (Chatbots educativos/asistentes): Redactar un correo, resumir un
PDF o responder preguntas complejas manteniendo una conversación fluida.
o Generación de código: Analizar un bloque de programación y predecir o escribir las siguientes
líneas de código para resolver un bug.
37
Escuela de Tecnologías de la Información www.senati.edu.pe

Transformer
38
Escuela de Tecnologías de la Información www.senati.edu.pe

Ejercicios de selección de arquitecturas
39
Escuela de Tecnologías de la Información www.senati.edu.pe

Caso 1: predicción de abandono de clientes
Una empresa de telecomunicaciones desea identificar qué clientes tienen mayor probabilidad de cancelar su servicio durante el
próximo mes.
Datos disponibles:
•
Antigüedad del cliente.
•
Facturación mensual.
•
Número de reclamos.
•
Consumo de servicios.
•
Historial de pagos.
•
Etiqueta histórica: canceló / no canceló.
Preguntas
1. ¿Qué tipo de problema se desea resolver?
2. ¿Qué arquitectura neuronal propondrías?
3. ¿Por qué sería adecuada para estos datos?
4. ¿Qué otra familia de modelos compararías?
40
Escuela de Tecnologías de la Información www.senati.edu.pe

Caso 1: predicción de abandono de clientes
1. ¿Qué tipo de problema se desea resolver?
Es un problema de clasificación binaria mediante aprendizaje supervisado.
• Clase 0: el cliente no cancela el servicio.
• Clase 1: el cliente cancela el servicio.
Se trata de aprendizaje supervisado porque contamos con datos históricos que incluyen las características de los clientes y la etiqueta que indica si
cancelaron o no. El objetivo es predecir qué clientes tienen mayor probabilidad de abandonar la empresa durante el próximo mes.
2. ¿Qué arquitectura neuronal propondrías?
Propondría una red neuronal multicapa (MLP, Multilayer Perceptron).
Esta arquitectura contiene una capa de entrada, una o varias capas ocultas y una capa de salida. Para este problema, la salida puede tener una
neurona con activación sigmoid, que produce una puntuación interpretable como probabilidad estimada de abandono, siempre que el modelo esté
adecuadamente entrenado y calibrado.
3. ¿Por qué sería adecuada para estos datos?
Porque los datos disponibles son principalmente tabulares y numéricos: antigüedad, facturación, reclamos, consumo e historial depagos.
4. ¿Qué otra familia de modelos compararías?
Compararía la MLP con los modelos basados en árboles de decisión, especialmente Random Forest y Gradient Boosting, como XGBoost o LightGBM.
41
Escuela de Tecnologías de la Información www.senati.edu.pe

Caso 2: inspección de productos
Una empresa fabrica piezas metálicas y desea identificar rayaduras, grietas y deformaciones a partir de fotografías tomadas en
una línea de producción..
Datos disponibles:
•
Fotografías de piezas.
•
Etiquetas de defectos.
•
Imágenes capturadas con distintas condiciones de iluminación..
Preguntas
1. ¿Qué tipo de problema se desea resolver?
2. ¿Qué arquitectura neuronal propondrías?
3. ¿Por qué sería adecuada para estos datos?
4. ¿Qué otra familia de modelos compararías?
42
Escuela de Tecnologías de la Información www.senati.edu.pe

Caso 2: inspección de productos
1. ¿Qué tipo de problema se desea resolver?
Es un problema de clasificación de imágenes supervisada, si cada imagen está etiquetada como producto defectuoso o no defectuoso.
Si se necesita localizar el defecto y dibujar su posición en la imagen, se trataría de un problema de detección de objetos o segmentación, según el
requerimiento..
2. ¿Qué arquitectura neuronal propondrías?
Una red neuronal convolucional (CNN, Convolutional Neural Network).
3. ¿Por qué sería adecuada para estos datos?
Porque las CNN procesan la estructura espacial de los píxeles mediante filtros que aprenden de forma automática características visuales jerárquicas
(bordes, texturas, formas, grietas, manchas y deformaciones), evitando la extracción manual y optimizando el reconocimiento de patrones industriales.
4. ¿Qué otra familia de modelos compararías?
Redes Neuronales Multicapa (MLP / Perceptrón Multicapa): Para evaluar una arquitectura totalmente conectada basada en vectores aplanados de píxeles,
sirviendo como modelo de referencia simple frente a las convoluciones espaciales.
43
Escuela de Tecnologías de la Información www.senati.edu.pe

Tensores
44
Escuela de Tecnologías de la Información www.senati.edu.pe

¿Qué es un tensor?
Un tensor es una estructura matemática que permite representar datos en una o varias dimensiones.
45
Escuela de Tecnologías de la Información www.senati.edu.pe

¿Qué es un tensor?
• Los tensores permiten representar de manera uniforme información numérica de diferentes dimensiones. En programación con Deep
Learning, esta estructura es fundamental porque las redes neuronales reciben y transforman tensores.
• Un escalar contiene un único valor. Un vector contiene una secuencia de valores y una matriz organiza los valores en filas y columnas.
Cuando necesitamos representar conjuntos de imágenes, secuencias u otras estructuras más complejas, utilizamos tensores de orden
superior.
• La forma de un tensor indica el tamaño de cada dimensión. Por ejemplo, (32, 64, 64, 3) representa 32 imágenes, cada una con 64 píxeles
de alto, 64 de ancho y 3 canales de color
Ejemplos de formas (shapes)
• Vector: (3,)
• Matriz: (2, 3)
• Lote de 32 imágenes RGB de 64 × 64: (32, 64, 64, 3)
46
Escuela de Tecnologías de la Información www.senati.edu.pe

¿Cómo se relacionan los tensores con las imágenes?
• Una imagen digital puede representarse mediante valores numéricos de sus píxeles.
• Imagen en escala de grises de
28 × 28: (28, 28).
• Lote de 100 imágenes en
escala de grises: (100, 28, 28).
• Lote de 100 imágenes RGB de
28 × 28: (100, 28, 28, 3).
Los tensores no son exclusivos de las
imágenes. También representan datos
tabulares, secuencias de texto
transformadas en números, audio y
muchas otras entradas utilizadas por
modelos de inteligencia artificial.
47
Escuela de Tecnologías de la Información www.senati.edu.pe

¿Qué es TensorFlow?
• TensorFlow es una plataforma de código abierto para computación numérica y aprendizaje automático.
• Permite
o Representar datos mediante tensores.
o Ejecutar operaciones matemáticas.
o Calcular gradientes automáticamente.
o Entrenar y ejecutar modelos de Machine Learning y Deep Learning.
o Utilizar recursos de CPU y, cuando están disponibles y configurados, GPU.
o Exportar y desplegar modelos en diferentes entornos.
48
Escuela de Tecnologías de la Información www.senati.edu.pe

¿Qué es Keras?
• Keras es una API de alto nivel para construir y entrenar modelos de Deep Learning. En este ejercicio utilizaremos tf.keras, la API
integrada en TensorFlow.
• Sus componentes principales incluyen:
o Sequential: Organiza capas en una secuencia.
o Dense: Capa de neuronas densamente conectadas.
o Conv2D: Capa de convolución bidimensional.MaxPooling2D: reduce las dimensiones espaciales mediante agrupamiento
máximo.
o Flatten: Convierte características multidimensionales en un vector.
o compile(): Configura la pérdida, el optimizador y las métricas.
o fit(): Entrena el modelo.
o evaluate(): Evalúa el modelo.
o predict(): Genera predicciones.
49
Escuela de Tecnologías de la Información www.senati.edu.pe

¡¡GRACIAS!!
50
Escuela de Tecnologías de la Información www.senati.edu.pe