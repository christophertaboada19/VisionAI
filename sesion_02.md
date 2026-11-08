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

Sesión 02
3
Escuela de Tecnologías de la Información www.senati.edu.pe

Objetivo de la Sesión
| Al finalizar   |            | la sesión, |               | el aprendiz    |             | será capaz      | de  | describir   | los |
| -------------- | ---------- | ---------- | ------------- | -------------- | ----------- | --------------- | --- | ----------- | --- |
| tipos de       | algoritmos |            |               | de aprendizaje |             | no supervisado, |     | diferenciar |     |
| los algoritmos |            | de         | clasificación |                | y           | agrupamiento,   | e   | implementar |     |
| el algoritmo   |            | K-Means    |               | con            | Python,     | interpretando   |     | los grupos  |     |
| obtenidos      |            | a partir   | de            | los datos      | analizados. |                 |     |             |     |
4
Escuela de Tecnologías de la Información www.senati.edu.pe

Temas
| • Describe |     | los | tipos |     | de algoritmos |     |     | de aprendizaje |     | no  |
| ---------- | --- | --- | ----- | --- | ------------- | --- | --- | -------------- | --- | --- |
supervisado.
| • Define      |     | las    | diferencias     |     |            |     | entre | algoritmos     |     | de  |
| ------------- | --- | ------ | --------------- | --- | ---------- | --- | ----- | -------------- | --- | --- |
| clasificación |     |        | y agrupamiento. |     |            |     |       |                |     |     |
| • Implementa  |     |        | algoritmo       |     | K-Means    |     | con   | Python.        |     |     |
| • Define      |     | la red | neuronal        |     | artificial |     | y     | su importancia |     | en  |
al IA.
| • Describe   |     | la  | estructura |     | de    | una        | red neuronal |               | artificial. |     |
| ------------ | --- | --- | ---------- | --- | ----- | ---------- | ------------ | ------------- | ----------- | --- |
| • Identifica |     | los | tipos      | de  | redes | neuronales |              | artificiales. |             |     |
| • Crea       | una | red | neuronal   |     | con   | Tensorflow |              | y             | Keras.      |     |
5
Escuela de Tecnologías de la Información www.senati.edu.pe

Charla de 5 minutos
Actos inseguros
6
Escuela de Tecnologías de la Información

7
Escuela de Tecnologías de la Información

Nociones previas
8
Escuela de Tecnologías de la Información www.senati.edu.pe

Caso: Logística Inteligente Express
• Una empresa de entrega de paquetes a domicilio tiene las
coordenadas geográficas (X, Y) de 1000 clientes en una ciudad, pero
no sabe cómo organizar sus rutas.
• El gerente de operaciones quiere dividir la ciudad en 3 zonas de
reparto eficientes para asignar un camión a cada una. El historial
contiene las ubicaciones, pero ningún registro tiene una etiqueta que
diga a qué zona pertenece.
9
Escuela de Tecnologías de la Información www.senati.edu.pe

Caso: Logística Inteligente Express
¿Qué tipo de ALGORITMO debemos utilizar en este caso:
Regresión o Clasificación?
¿Podemos usar la librería de Scikit-Learn en este caso?
10
Escuela de Tecnologías de la Información www.senati.edu.pe

Aprendizaje no supervisado
El aprendizaje no supervisado es una rama del machine learning en la que los algoritmos analizan y procesan
datos que no tienen etiquetas ni respuestas predefinidas.
A diferencia del aprendizaje supervisado, donde el algoritmo sabe lo que busca, este modelo analiza la
información bruta para descubrir patrones, estructuras internas y relaciones ocultas por sí mismo
No hay
etiquetas.
No hay
respuestas
previas para
cada
observación
11
Escuela de Tecnologías de la Información www.senati.edu.pe

Clasificación vs. Agrupamiento (Clustering)
Clasificación (Supervisado): El modelo aprende de etiquetas del pasado (Ejemplo:
"Fraude" o "No Fraude") para predecir el grupo de un dato nuevo.
Agrupamiento (No Supervisado): El Modelo no tiene etiquetas. Su trabajo es
descubrir patrones ocultos y agrupar los datos por similitud geométrica (distancia).
12
Escuela de Tecnologías de la Información www.senati.edu.pe

Desarrollo
13
Escuela de Tecnologías de la Información www.senati.edu.pe

Aprendizaje no supervisado
El aprendizaje no supervisado es una técnica de inteligencia artificial y aprendizaje automático donde el modelo analiza
datos que no tienen etiquetas ni resultados predefinidos. Su objetivo principal es explorar la información para descubrir
patrones, estructuras ocultas o relaciones por sí mismo.
14
Escuela de Tecnologías de la Información www.senati.edu.pe

Agrupamiento (Clustering)
Divide los datos en grupos o "clústeres" que comparten características similares de forma natural. Su objetivo es la segmentación. Junta
elementos que se parecen entre sí y separa los que son diferentes.
Algoritmos comunes:
• K-Means (Particionamiento): Divide los datos en un número fijo de K clústeres definidos previamente, buscando centros (centroides) para
agrupar puntos esféricos.
• Clustering Jerárquico: Construye una jerarquía de grupos (a menudo visualizada con un dendograma) fusionando o dividiendo datos en
distintos niveles.
• DBSCAN (Basado en densidad): Agrupa puntos según la densidad del espacio, lo que le permite detectar formas irregulares y marcar
puntos aislados como ruido.
• Modelos de Mezcla Gaussiana (GMM): Asume que los datos provienen de una mezcla de varias distribuciones gaussianas o normales.
Ejemplo: Segmentar a los clientes de un banco en "perfiles de gasto" (viajeros, ahorradores, compradores compulsivos) para ofrecerles
productos personalizados.
15
Escuela de Tecnologías de la Información www.senati.edu.pe

Reglas de asociación:
Su objetivo es descubrir relaciones ocultas. Busca patrones del tipo "si ocurre A, es muy probable que ocurra B".
Algoritmos comunes:
• Apriori: Utiliza un enfoque de "fuerza bruta inteligente" donde asume que si un conjunto de elementos es
frecuente, todos sus subconjuntos también lo son.
• FP-Growth (Frequent Pattern Growth): Es la evolución y alternativa eficiente a Apriori. En lugar de generar
combinaciones candidatas una por una, comprime la base de datos en una estructura de árbol (FP-Tree). Solo
necesita escanear la base de datos dos veces, lo que lo hace mucho más rápido en grandes volúmenes de datos.
• ECLAT (Equivalence Class Transformation): A diferencia de Apriori y FP-Growth que buscan de manera
horizontal (registro por registro), ECLAT realiza una búsqueda vertical. Se enfoca en los IDs de las transacciones
en las que aparece cada producto, lo que acelera el cálculo al usar operaciones de intersección de conjuntos.
Ejemplo: Detectar que quienes compran pañales los viernes por la tarde también suelen comprar cerveza.
16
Escuela de Tecnologías de la Información www.senati.edu.pe

Reducción de dimensionalidad
Su objetivo es la simplificación. Cuando un conjunto de datos tiene cientos de columnas (variables), este proceso lo "comprime" a las columnas más importantes
para que los modelos visuales o de cálculo sean más rápidos y eficientes, sin perder la esencia de la información.
Algoritmos comunes:
• Métodos Lineales
o PCA (Análisis de Componentes Principales): Transforma las variables originales en un nuevo conjunto de variables incorrelacionadas
llamadas "componentes principales", ordenadas de mayor a menor cantidad de información (varianza) retenida.•
o LDA (Análisis Discriminante Lineal): A diferencia de PCA (que es puramente no supervisado), LDA se usa a menudo de forma supervisada
porque reduce las dimensiones buscando maximizar la separación entre diferentes clases o categorías ya conocidas.
• Métodos No Lineales (Manifold Learning)
o t-SNE (t-DistributedStochasticNeighborEmbedding): Mapea datos de cientos de dimensiones a solo 2 o 3 dimensiones, logrando mantener
los elementos similares muy cerca y los diferentes muy lejos. Es ideal para ver agrupamientos visuales, pero no sirve para entrenar otros
modelos porque deforma las distancias globales.
o UMAP (UniformManifold Approximationand Projection): Es la alternativa moderna a t-SNE. Es mucho más rápido, maneja mejor conjuntos
de datos gigantescos y, a diferencia de t-SNE, preserva mejor la estructura global de los datos (no solo las relaciones de vecindad cercana).
Ejemplo: Comprimir los miles de píxeles de una imagen de reconocimiento facial a solo unos pocos "rasgos clave" (componentes principales).
17
Escuela de Tecnologías de la Información www.senati.edu.pe

Algoritmo K-Means
Es uno de los algoritmos de aprendizaje no supervisado más populares y utilizados. Su objetivo principal es particionar un
conjunto de datos en K grupos (clústeres) distintos, donde cada dato pertenece al grupo con el centroide (centro del clúster)
más cercano.
18
Escuela de Tecnologías de la Información www.senati.edu.pe

¿Cómo funciona el Algoritmo K-Means?
1. Eliges K: Defines cuántos grupos deseas encontrar.
2. Asignación: El algoritmo coloca (K) puntos iniciales (centroides) de forma aleatoria y agrupa cada dato
con el centroide más cercano (usualmente midiendo la distancia euclidiana).
3. Actualización: Calcula el centro real de los puntos asignados a cada grupo y mueve el centroide a esa
nueva posición.
4. Repetición: Repite el proceso de asignación y actualización hasta que los centroides ya no se muevan.
La distancia euclidiana es la longitud del segmento de recta que une a dos puntos en un espacio geométrico. Representa la distancia más corta
y directa entre ellos.
19
Escuela de Tecnologías de la Información www.senati.edu.pe

¿Cómo funciona el Algoritmo K-Means?
En el algoritmo de K-means, los
polígonos de Voronoi representan
las regiones de decisión finales
creadas tras agrupar los datos.
20
Escuela de Tecnologías de la Información www.senati.edu.pe

Algoritmo K-Means: Casos de Uso Comunes
• Segmentación de clientes: Agrupar compradores por hábitos de compra y ticket
promedio para campañas de marketing.
• Sistemas de recomendación: Encontrar grupos con gustos parecidos para sugerir
productos o contenido.
• Detección de anomalías y fraudes: Identificar transacciones o comportamientos que no
encajan en ningún clúster normal.
• Organización de información: Agrupar noticias, documentos o genes con patrones
similares
21
Escuela de Tecnologías de la Información www.senati.edu.pe

Implementación de K-means
https://colab.research.google.com/drive/1_S-pdLdqB30T1ZZEZRr0M7XBa3-l6z--?usp=sharing
22
Escuela de Tecnologías de la Información www.senati.edu.pe

Introducción a Redes Neuronales
(Deep Learning)
23
Escuela de Tecnologías de la Información www.senati.edu.pe

¿Qué es una Red Neuronal Artificial (ANN)?
Es un modelo computacional inspirado en la estructura biológica del cerebro humano. Está compuesta
por unidades de procesamiento llamadas neuronas matemáticas interconectadas entre sí.
Estructura Estándar:
1. Capa de Entrada (Input Layer): Recibe las características numéricas crudas (Ej: píxeles de una
cámara).
2. Capas Ocultas (Hidden Layers): Extraen patrones abstractos multiplicando los datos por
Pesos (Weights) y aplicando Funciones de Activación (como ReLU).
3. Capa de Salida (Output Layer): Entrega la decisión probabilística final usando funciones de
activación como Softmax para clasificación.
24
Escuela de Tecnologías de la Información www.senati.edu.pe

Hiperparámetros en la Red Neuronal Artificial?
•
En las redes neuronales, los
Hiperparámetros son variables de
configuración externa que se
definen manualmente antes de
iniciar el entrenamiento y que
controlan cómo aprende el modelo
•
A diferencia de los parámetros
(como los pesos y sesgos), los
cuales la red neuronal aprende y
ajusta automáticamente a partir de
los datos durante el entrenamiento,
los hiperparámetros son fijados por
el programador o científico de
datos.
25
Escuela de Tecnologías de la Información www.senati.edu.pe

Hiperparámetros en la Red Neuronal Artificial?
•
De arquitectura (del modelo): Definen la estructura física y la capacidad de la red.
o Número de capas ocultas.
o Número de neuronas por capa.
o Tipos de funciones de activación (ReLU, Sigmoide, etc.).
•
De entrenamiento (del algoritmo): Controlan cómo avanza la optimización de la red.
o Tasa de aprendizaje (learning rate): Qué tan grandes son los pasos que da el optimizador al corregir los errores.
o Tamaño del lote (batchsize): Cuántas muestras de datos se procesan antes de actualizar los pesos de la red.
o Épocas (epochs): Cuántas veces pasa el conjunto completo de datos de entrenamiento a través de la red.
•
De regularización: Sirven para evitar que la red memorice los datos en exceso (sobreajuste o overfitting).
o Dropout (desconexión aleatoria de neuronas durante el entrenamiento).
o Penalizaciones (como regularización L1 o L2)
26
Escuela de Tecnologías de la Información www.senati.edu.pe

¿Qué es una Época para la Red Neuronal Artificial?
Una época (o epoch, en inglés) es un ciclo completo de entrenamiento en el que la red neuronal artificial procesa la
totalidad del conjunto de datos de entrenamiento una vez.
• Una pasada completa: Durante una época, cada muestra de los datos de entrenamiento pasa por la red para
que esta ajuste sus parámetros internos (pesos y sesgos).
• Lotes e iteraciones: Como el conjunto de datos suele ser muy grande, se divide en porciones más pequeñas
llamadas lotes (batches). El número de lotes necesarios para completar una época depende del tamaño de
cada lote.
• Múltiples épocas: Una sola pasada rara vez basta para que la red aprenda patrones complejos. Por ello, el
entrenamiento requiere múltiples épocas para reducir el error de predicción de forma gradual.
• Iteración (Iteration): El paso en el que la red procesa un solo lote de datos. Una época contiene varias
iteraciones
27
Escuela de Tecnologías de la Información www.senati.edu.pe

¿Qué es una Función de Activación?
En una red neuronal, una función de activación es una ecuación matemática que se aplica a la salida de
cada neurona para determinar si debe "activarse" (transmitir información) o no. En términos sencillos, es
el interruptor matemático que decide si una neurona debe "encenderse" (transmitir información) o no, y
con qué intensidad.
¿Cómo actúa en la red neuronal?
Su objetivo principal es introducir no linealidad en el modelo. Sin una función de activación, una red
neuronal sería solo una enorme combinación de sumas y multiplicaciones lineales. Esto significa que, sin
importar cuántas capas tenga la red, se comportaría como un modelo de regresión lineal simple y sería
incapaz de aprender patrones complejos como imágenes, texto o audio.
28
Escuela de Tecnologías de la Información www.senati.edu.pe

¿Qué es una Función de Activación?
Cada neurona de la red,
sin importar en qué capa
se encuentre, repite de
forma idéntica los pasos
de este gráfico: multiplica
sus entradas por pesos
matemáticos, añade un
sesgo (Σ + sesgo) y filtra
el resultado a través de
una Función de Activación.
29
Escuela de Tecnologías de la Información www.senati.edu.pe

¿Qué es una Función de Activación?
30
Escuela de Tecnologías de la Información www.senati.edu.pe

¿Qué es una Función de Activación?
1. En las Capas Ocultas (Procesamiento Interno):
• Función Utilizada: ReLU
• Objetivo: Introducir no linealidad para que el modelo pueda doblar sus ecuaciones y aprender formas
complejas (como las curvas y bordes de los números de una cámara).
2. En la Capa de Salida (Decisión Final):
• Función Utilizada: Softmax
• Objetivo: Tomar las señales de las capas previas y transformarlas en un vector de probabilidades
(porcentajes que suman 100%) para que el usuario sepa con qué nivel de confianza el modelo identificó cada
número.
31
Escuela de Tecnologías de la Información www.senati.edu.pe

Cuándo usar ReLU y cuándo cambiarla
Escenario A: Clasificación Estándar de Imágenes (El Detector de Números por Cámara)
• Decisión: Usar ReLU.
• ¿Por qué?: Es el estándar de oro. El procesamiento de píxeles requiere miles de millones de
operaciones matemáticas por segundo. ReLU es ultra rápida de calcular (solo convierte los negativos
en cero), permitiendo que el video de la cámara web corra fluido a 30 cuadros por segundo sin
congelar la computadora.
https://colab.research.google.com/drive/18clsBrMpRowFqfd6flh6MGyFHQ1AuyqI?usp=sharing
32
Escuela de Tecnologías de la Información www.senati.edu.pe

Cuándo usar ReLU y cuándo cambiarla
Escenario B: El Cerebro se Congela (Efecto Neurona Muerta / Die-Hard ReLU)
• Problema: Estás entrenando una red neuronal profunda para reconocer rostros y notas que, a partir
de la época 4, la precisión se estanca por completo y el error ya no baja. Al revisar los datos,
descubres que el 70% de las neuronas ocultas están botando 0 de forma permanente debido a que
reciben señales negativas recurrentes. Las neuronas "murieron".
• Decisión: Cambiar ReLU por Leaky ReLU o ELU..
• ¿Por qué?: • Al aplicar layers.LeakyReLU(alpha=0.01), los valores negativos ya no se destruyen por
completo en cero; se les permite conservar una pequeña pendiente decimal. Esto reanima las
neuronas muertas, permitiendo que sigan actualizando sus pesos y el modelo continúe aprendiendo
texturas complejas de la piel.
33
Escuela de Tecnologías de la Información www.senati.edu.pe

Cuándo usar ReLU y cuándo cambiarla
https://colab.research.google.com/drive/1Mqwfo2Zh53zVANo73I0OPCrJXdXHqYsR?usp=sharing
34
Escuela de Tecnologías de la Información www.senati.edu.pe

Cuándo usar ReLU y cuándo cambiarla
Escenario C: Procesamiento de Lenguaje Natural
• Decisión: Cambiar ReLU por GELU.
• ¿Por qué?: ReLU corta los números de forma muy brusca en el cero absoluto. El lenguaje humano
requiere transiciones matemáticas mucho más suaves y probabilísticas (un comportamiento
estocástico). GELU es la función moderna que usan las arquitecturas Transformers; permite que el
modelo entienda el contexto y la semántica de los textos con mayor fluidez.
Comportamiento estocástico: Es un proceso que contiene un elemento de aleatoriedad, azar o probabilidad. Es lo opuesto a algo "determinista"
(donde una misma entrada siempre da exactamente el mismo resultado matemático fijo).
35
Escuela de Tecnologías de la Información www.senati.edu.pe

¡¡GRACIAS!!
36
Escuela de Tecnologías de la Información www.senati.edu.pe