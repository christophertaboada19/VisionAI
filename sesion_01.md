| CARRERA  | :   | INTELIGENCIA ARTIFICIAL IV SEMESTRE |
| -------- | --- | ----------------------------------- |
| CURSO    | :   | MACHINE LEARNING Y DEEP LEARNING    |
Instructor Mg. Arturo Huapaya H.
Escuela de Tecnologías de la Información

Objetivo del curso
| Al  finalizar  | el  módulo  | formativo,  | el  aprendiz  | tendrá  | un  |
| -------------- | ----------- | ----------- | ------------- | ------- | --- |
comprensión sólida y práctica de los fundamentos esenciales
| del  Machine  | Learning    | y  Deep        | Learning,  | así  como  | las     |
| ------------- | ----------- | -------------- | ---------- | ---------- | ------- |
| habilidades   | necesarias  | para  aplicar  | estos      | conceptos  | en  la  |
resolución de problemas del mundo real mediante el lenguaje
Python
2
Escuela de Tecnologías de la Información www.senati.edu.pe

Sesión 01
3
Escuela de Tecnologías de la Información www.senati.edu.pe

Objetivo de la Sesión
Al finalizar la sesión, el aprendiz será capaz de diferenciar la
| Inteligencia  | Artificial,       | Machine  | Learning         | y  Deep  | Learning,    | y   |
| ------------- | ----------------- | -------- | ---------------- | -------- | ------------ | --- |
| clasificar    | los  principales  | tipos    | de  aprendizaje  |          | automático,  |     |
utilizando material de estudio y ejemplos de aplicaciones de
IA, considerando sus características y aplicaciones.
4
Escuela de Tecnologías de la Información www.senati.edu.pe

Temas
Fundamentos de inteligencia artificial:
• Conceptos y aplicaciones
• Diferencias entre IA, Machine Learning y Deep Learning
| o Definición de aprendizaje automático  |     |     |     |
| --------------------------------------- | --- | --- | --- |
• Tipos de aprendizaje automático
| o Aprendizaje supervisado |     |     |     |
| ------------------------- | --- | --- | --- |
o
Aprendizaje no supervisado
| o Aprendizaje por reforzamiento |                     |           |                 |
| ------------------------------- | ------------------- | --------- | --------------- |
| • Diferencias                   | entre  aprendizaje  | profundo  | y  aprendizaje  |
automático..
5
Escuela de Tecnologías de la Información www.senati.edu.pe

Charla de 5 minutos
Aligera la carga
6
Escuela de Tecnologías de la Información

7
Escuela de Tecnologías de la Información

Nociones previas
8
Escuela de Tecnologías de la Información www.senati.edu.pe

Caso: Inmobiliaria Hogar Seguro
• La empresa inmobiliaria **Hogar Seguro** administra una base de datos con información histórica de viviendas que fueron
vendidas durante los últimos años. Cada registro contiene la superficie de la vivienda, expresada en metros cuadrados, y
su precio final de venta, expresado en soles.
• El área comercial desea mejorar sus estimaciones de precios para orientar a los clientes que buscan comprar o vender
una propiedad. Actualmente, los asesores realizan estimaciones basándose principalmente en su experiencia, lo que
puede generar diferencias entre las valoraciones realizadas por distintos trabajadores.
• Ante esta situación, la empresa propone desarrollar un programa en Python que analice los datos históricos y aprenda la
relación entre la superficie de una vivienda y su precio de venta. Para ello, se utilizará un algoritmo de aprendizaje
supervisado.
• El modelo deberá identificar una relación matemática entre los metros cuadrados y el precio de venta, utilizando los
registros históricos para entrenarse. Posteriormente, se podrá ingresar la superficie de una vivienda nueva para obtener
una estimación de su precio.
• Sin embargo, ¿Que debemos hacer antes de implementar la solución? ¿Que algoritmo es el indicado para esta finalidad?
9
Escuela de Tecnologías de la Información www.senati.edu.pe

Caso: Inmobiliaria Hogar Seguro
La empresa proporciona una muestra del siguiente conjunto de datos de ejemplo:
10
Escuela de Tecnologías de la Información www.senati.edu.pe

Caso: Inmobiliaria Hogar Seguro
• Pandas y NumPy: Fundamentales para
crear la estructura de datos (DataFrames) y
realizar operaciones matemáticas
vectorizadas.
• Matplotlib y Seaborn: Utilizados para
generar histogramas y gráficos de
dispersión que nos permitan auditar los
datos.
• Sklearn.Preprocessing: Contiene las clases
necesarias para ajustar las escalas
numéricas antes de entrenar un algoritmo.
11
Escuela de Tecnologías de la Información www.senati.edu.pe

Caso: Inmobiliaria Hogar Seguro
• Se utiliza una distribución uniforme (no
normal) para la superficie, asegurando una
variedad equitativa de tamaños de
viviendas.
• Añadimos un "ruido" gaussiano
(np.random.normal) para asegurar que los
puntos no estén perfectamente alineados
en una línea recta exacta, imitando las
variaciones del mercado inmobiliario real.
12
Escuela de Tecnologías de la Información www.senati.edu.pe

Caso: Inmobiliaria Hogar Seguro
• El método .describe() nos permite observar
la media, desviación estándar, valores
mínimos y máximos de la superficie y el
precio. Esto ayuda a identificar valores
atípicos (outliers) o anomalías en la
simulación.
• .isnull().sum() confirma que no existan
registros vacíos que puedan romper
nuestro algoritmo de aprendizaje
supervisado.
13
Escuela de Tecnologías de la Información www.senati.edu.pe

Caso: Inmobiliaria Hogar Seguro
• Decisión de Escalado: Al observar el
gráfico, vemos que la distribución es
plana/uniforme y no presenta una curva de
Gauss perfecta (normal). Por lo tanto, el
escalador óptimo es MinMaxScaler, el cual
transformará los valores al rango estricto
entre [0, 1].
• StandardScaler se reserva principalmente
para variables con distribuciones
normales/gaussianas muy marcadas.
14
Escuela de Tecnologías de la Información www.senati.edu.pe

Caso: Inmobiliaria Hogar Seguro
15
Escuela de Tecnologías de la Información www.senati.edu.pe

Caso: Inmobiliaria Hogar Seguro
• sns.regplot(...): Este comando dibuja cada
una de las 1000 viviendas como un punto
azul/verde en el plano y calcula
matemáticamente la línea recta que mejor
se ajusta a los datos reales.
• alpha=0.5: Le da transparencia a los puntos
para que se pueda apreciar la densidad en
las zonas donde se superponen los
registros.
16
Escuela de Tecnologías de la Información www.senati.edu.pe

Caso: Inmobiliaria Hogar Seguro
• Tendencia Clara y Ascendente: Los datos revelan un
patrón geométrico en diagonal ascendente. Esto
significa que a medida que aumentan los metros
cuadrados de la vivienda, el precio de venta
incrementa de forma constante.
• Correlación Directa (Positiva): Existe una dependencia
lineal directa entre ambas variables. El
comportamiento del mercado no es caótico ni
disperso; la superficie es un predictor sumamente
potente y confiable para determinar el valor
económico del inmueble.
• Comportamiento Homogéneo: El "ruido" o dispersión
de los puntos alrededor de la línea central se mantiene
constante en todo el recorrido (desde los 40 hasta los
200 (m2). Esto demuestra que el mercado se comporta
de manera estable, sin importar si la vivienda es
pequeña o muy grande, lo que reduce la
incertidumbre comercial.
17
Escuela de Tecnologías de la Información www.senati.edu.pe

Caso: Inmobiliaria Hogar Seguro
6: Determinación del Algoritmo
• Naturaleza de la Variable a Predecir: El objetivo es estimar el Precio_Venta_Soles. Esta es una variable de tipo numérica continua,
ya que el dinero puede tomar infinitos valores decimales dentro de un rango (no está limitada a categorías fijas como "barato" o
"caro").
• Tipo de aprendizaje: Debe ser Aprendizaje Supervisado, dado que la base de datos histórica cuenta con las "respuestas correctas"
(sabemos exactamente a cuánto se vendió cada casa en el pasado), el sistema requiere un enfoque supervisado para aprender de
esos ejemplos.
• ¿Qué algoritmo es el indicado y por qué? El algoritmo indicado es la Regresión Lineal Simple. ¿Por qué?:
1. Ajuste Geométrico Perfecto: La fase previa demostró una relación es lineal y directa entre la entrada y la salida. Una línea
recta matemática es el modelo más eficiente y con menor costo computacional para representar este fenómeno.
2. Simplicidad y Transparencia: Al ser una sola variable predictora (metros cuadrados), la Regresión Lineal permite a los asesores
comerciales entender exactamente cómo se calcula el precio (ej. Precio = (Metros × Valor por metro) + Base), eliminando el
efecto de "caja negra" de inteligencias artificiales más complejas.
https://colab.research.google.com/drive/15sAF-QgtRGR2MN-U8eCtsQ7o3MHS3H-q?usp=sharing
18
Escuela de Tecnologías de la Información www.senati.edu.pe

¿Podemos utilizar cualquier algoritmo
para hacer predicciones?
19
Escuela de Tecnologías de la Información www.senati.edu.pe

Caso: AgroTec del Norte
• La empresa agroindustrial "AgroTec del Norte" registra históricamente la cantidad de
fertilizante aplicado (en kilogramos por hectárea) y la producción final de maíz obtenida
(en toneladas por hectárea).
• El área de operaciones desea optimizar los costos de producción. Saben que no aplicar
fertilizante da cosechas pobres, pero aplicar en exceso quema el cultivo o desperdicia
dinero. Por lo que quieren un modelo de IA que analice los datos históricos y aprenda a
estimar la producción según el fertilizante.
• ¿Que debemos hacer antes de implementar la solución? ¿Que algoritmo es el indicado
para esta finalidad? Debemos tener en cuenta que el comportamiento de la naturaleza no
siempre predecible.
20
Escuela de Tecnologías de la Información www.senati.edu.pe

Caso: AgroTec del Norte
La empresa proporciona una muestra del siguiente conjunto de datos de ejemplo:
21
Escuela de Tecnologías de la Información www.senati.edu.pe

Caso: AgroTec del Norte
22
Escuela de Tecnologías de la Información www.senati.edu.pe

Caso: AgroTec del Norte
23
Escuela de Tecnologías de la Información www.senati.edu.pe

Caso: AgroTec del Norte
24
Escuela de Tecnologías de la Información www.senati.edu.pe

Caso: AgroTec del Norte
25
Escuela de Tecnologías de la Información www.senati.edu.pe

Caso: AgroTec del Norte
26
Escuela de Tecnologías de la Información www.senati.edu.pe

Caso: AgroTec del Norte
27
Escuela de Tecnologías de la Información www.senati.edu.pe

Caso: AgroTec del Norte
28
Escuela de Tecnologías de la Información www.senati.edu.pe

Caso: AgroTec del Norte
• Relación Cambiante (No Proporcional): A diferencia de las
casas, donde "más metros siempre es más precio", aquí el
comportamiento cambia según el tramo:
o Tramo 1 (Ascendente): De 10 a 100 kg de fertilizante, la
producción sube de forma acelerada. El fertilizante nutre
la planta.
o Tramo 2 (Punto Óptimo): Cerca de los 100 kg, la
producción alcanza su punto máximo (aproximadamente
10 Ton/ha).
o Tramo 3 (Descendente): Pasando los 100 kg, la
producción comienza a caer. Demasiado químico satura
el suelo y daña el cultivo.
• Geometría de Curva (Parábola): Los datos forman una
estructura arqueada. Si intentáramos trazar una línea recta a
través de estos puntos, la recta quedaría dividida dejando
muchos datos fuera, cometiendo un error de estimación
masivo.
29
Escuela de Tecnologías de la Información www.senati.edu.pe

Caso: AgroTec del Norte
6: Determinación del Algoritmo
• Naturaleza de la Variable a Predecir: La variable objetivo (Produccion_Ton) sigue siendo numérica continua (el peso en toneladas
puede tener cualquier valor decimal). Sigue siendo un problema de Aprendizaje Supervisado
• ¿Por qué NO podemos usar el algoritmo anterior (Regresión Lineal Simple)? Porque una línea recta matemática solo puede ir en
una dirección (siempre sube o siempre baja). Es totalmente incapaz de capturar un fenómeno que primero sube y luego baja. Forzar
una línea recta aquí causaría un problema grave llamado Underfitting (el modelo sería demasiado simple para entender la realidad).
• ¿Qué algoritmo es el indicado y por qué? El algoritmo indicado es la Regresión NO Lineal. ¿Por qué?:
1. El algoritmo indicado debe tener la capacidad de trazar y aprender una Relación No Lineal (específicamente mediante una
Regresión Polinomial o algoritmos basados en curvas).
2. Necesitamos un modelo matemático cuyas ecuaciones incluyan exponentes (como x2). Esto le permite a la Inteligencia
Artificial flexibilizar su "brazo" de predicción, curvear la línea para seguir el patrón real de los datos, encontrar con precisión el
punto óptimo de producción y predecir las caídas del rendimiento.
https://colab.research.google.com/drive/1CbjCyo3a_2PhFphrX6Yg1-eMXjrGSF5-?usp=sharing
30
Escuela de Tecnologías de la Información www.senati.edu.pe

Las líneas rectas son rígidas y solo siguen una dirección constante (como a
más metros, más precio). Si los datos describen un rendimiento decreciente
o un comportamiento que cambia de dirección (como el fertilizante, que
primero ayuda y luego satura), necesitas un algoritmo No Lineal con
exponentes (x2) para que la IA curve su trayectoria y no cometa errores
masivos.
31
Escuela de Tecnologías de la Información www.senati.edu.pe

El Underfitting (o subajuste) ocurre cuando un
modelo de Inteligencia Artificial es demasiado
simple para entender el patrón real de los datos.
32
Escuela de Tecnologías de la Información www.senati.edu.pe

Desarrollo
33
Escuela de Tecnologías de la Información www.senati.edu.pe

Estructuras de Control vs. Vectorización en ML
¿Cuándo NO usar bucles for / while? (¡Mala Práctica en Datos!)
No se deben usar bucles tradicionales para filtrar, limpiar o transformar
filas de un dataset masivo. Los bucles procesan un dato a la vez en la
CPU, lo cual vuelve el código extremadamente lento e ineficiente.
34
Escuela de Tecnologías de la Información www.senati.edu.pe

Estructuras de Control vs. Vectorización en ML
35
Escuela de Tecnologías de la Información www.senati.edu.pe

Estructuras de Control vs. Vectorización en ML
Filtrado Vectorizado (Pandas / NumPy)
Las librerías de ML aplican operaciones en paralelo a nivel de hardware. Usamos
máscaras booleanas o filtros directos en lugar de bucles:
36
Escuela de Tecnologías de la Información www.senati.edu.pe

Estructuras de Control vs. Vectorización en ML
¿Cuándo SÍ se utilizan estructuras de control en Machine Learning?
Los condicionales y bucles no se eliminan, sino que cambian de propósito. Se usan exclusivamente
para controlar el flujo del experimento, no para procesar registros individuales:
37
Escuela de Tecnologías de la Información www.senati.edu.pe

Estructuras de Control vs. Vectorización en ML
¿Cuándo SÍ se utilizan estructuras de control en Machine Learning?
Los condicionales y bucles no se eliminan, sino que cambian de propósito. Se usan exclusivamente
para controlar el flujo del experimento, no para procesar registros individuales:
38
Escuela de Tecnologías de la Información www.senati.edu.pe

El Ecosistema de Librerías para IA (Foco en ML
& Deep Learning)
39
Escuela de Tecnologías de la Información www.senati.edu.pe

Tratamiento de datos
• Pandas es una de las librerías de código abierto más populares de Python utilizada para la
manipulación y el análisis de datos. Aunque no es una librería de Machine Learning (ML) en sí
misma—ya que no entrena modelos ni algoritmos—es una herramienta imprescindible en el flujo
de trabajo de ML.
• NumPy (Numerical Python) es la librería fundamental de Python para el cálculo numérico y el
procesamiento de matrices, sirviendo como el verdadero motor matemático detrás de Pandas y
casi todo el ecosistema de Machine Learning (ML).
40
Escuela de Tecnologías de la Información www.senati.edu.pe

Scikit-Learn: El Estándar para ML
• Diseñado exclusivamente para algoritmos de aprendizaje supervisado y no supervisado sobre datos
estructurados (tablas, filas y columnas).
• Ideal para modelos geométricos, estadísticos y lineales como la Regresión Lineal, Regresión No
Lineal (Polinomial), Árboles de Decisión, Random Forest y Máquinas de Soporte Vectorial (SVM).
• Provee todo el pipeline de modelado:
o División de datos (train_test_split)
o Preprocesamiento (MinMaxScaler, StandardScaler)
o Métricas de evaluación (R2, MAE, MSE).
41
Escuela de Tecnologías de la Información www.senati.edu.pe

PyTorch: Motor Deep Learning y Redes Neuronales
• Framework avanzado optimizado para el diseño, entrenamiento y despliegue de Redes Neuronales
Profundas (Deep Learning).
• Soporta el procesamiento de datos complejos no estructurados como Imágenes (Visión Artificial),
Audio, Texto (Procesamiento de Lenguaje Natural) y LLMs.
• Su arquitectura se basa en Tensores (matrices multidimensionales dinámicas) y posee un motor de
diferenciación automática (Autograd) para calcular gradientes matemáticos complejos. A
diferencia de Scikit-Learn, está diseñado para transferir el procesamiento de la CPU directamente a
la GPU (tarjetas gráficas) para ejecutar miles de millones de operaciones matemáticas en paralelo.
42
Escuela de Tecnologías de la Información www.senati.edu.pe

Estadística Básica para ML y DL
43
Escuela de Tecnologías de la Información www.senati.edu.pe

Tendencias estadísticas
44
Escuela de Tecnologías de la Información www.senati.edu.pe

Probabilidades
• ¿Qué es en el contexto de los modelos Predictivos?
• Es el marco matemático que permite cuantificar la incertidumbre. Dado que los datos del mundo real
contienen ruido, imperfecciones y variables ocultas, los modelos calculan la viabilidad de que un evento
ocurra.
• El Lenguaje del Vector de Salida: Por ejemplo, un modelo de clasificación no dice "Esto es un perro". El
modelo devuelve una distribución de probabilidad:
• La Toma de Decisión: La capa final toma la probabilidad más alta mediante una función de activación
(como Softmax), convirtiendo la incertidumbre matemática en una predicción concreta del sistema.
45
Escuela de Tecnologías de la Información www.senati.edu.pe

Probabilidades
• Para Machine Learning tradicional con Scikit-Learn, la probabilidad condicional es la
herramienta que nos permite clasificar. Cuando construimos un modelo para detectar
fraudes financieros o predecir si un cliente abandonará una plataforma, no buscamos una
respuesta binaria rígida de sí o no. Buscamos el porcentaje de riesgo.
• Algoritmos como la Regresión Logística o Naive Bayes estiman esa probabilidad
condicional P(Fraude/Transacción), dándole al negocio un umbral de decisión para
bloquear o aprobar una operación.
P(Fraude/Transacción) se lee “La Probabilidad de que una operación sea un Fraude, DADO QUE ya conocemos las
características específicas de esa Transacción”
46
Escuela de Tecnologías de la Información www.senati.edu.pe

Probabilidades
• En el terreno de PyTorch y el Deep Learning, las probabilidades se vuelven masivas. Una red
neuronal es, en esencia, una gigantesca máquina aproximadora de funciones de probabilidad.
• Cuando entrenamos un modelo de visión artificial para clasificar tumores en radiografías, la red
utiliza la probabilidad para calcular su nivel de confianza.
• Además, toda la revolución actual de la IA Generativa se basa en la probabilidad: un LLM
simplemente predice el token o palabra con mayor probabilidad matemática dentro de un
contexto. Entender la probabilidad es entender cómo piensa una red neuronal."
LLM significa Large Language Model (en español, Gran Modelo de Lenguaje).
47
Escuela de Tecnologías de la Información www.senati.edu.pe

Regresión Lineal Simple
https://colab.research.google.com/drive/1LFX1j_CNsy7cvISIlDkURBdPsiNoCyCv?usp=sharing
48
Escuela de Tecnologías de la Información www.senati.edu.pe

Regresión Lineal Multiple
https://colab.research.google.com/drive/134z6UEWf9iOGky052SHbw4xZwC7CptTR?usp=sharing
49
Escuela de Tecnologías de la Información www.senati.edu.pe

¡¡GRACIAS!!
50
Escuela de Tecnologías de la Información www.senati.edu.pe