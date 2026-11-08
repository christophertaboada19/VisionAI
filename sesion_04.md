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

Sesión 04
3
Escuela de Tecnologías de la Información www.senati.edu.pe

Objetivo de la Sesión
| Al finalizar    |             | la  | sesión,      | el             | aprendiz      | será     | capaz        | de explicar     | la  |
| --------------- | ----------- | --- | ------------ | -------------- | ------------- | -------- | ------------ | --------------- | --- |
| importancia     |             | de  | la           | visión         | computacional |          | en           | la Inteligencia |     |
| Artificial,     | describir   |     | los          | fundamentos    |               | de       | la detección | de objetos,     |     |
| la segmentación |             |     | y el         | reconocimiento |               | de       | patrones,    | e identificar   |     |
| sus             | principales |     | aplicaciones |                |               | mediante |              | ejemplos        | de  |
| procesamiento   |             |     | de imágenes  |                | con           | Python   | y OpenCV.    |                 |     |
4
Escuela de Tecnologías de la Información www.senati.edu.pe

Temas
| • Librerías                                | de Python | OpenCV            | para visión | computacional. |
| ------------------------------------------ | --------- | ----------------- | ----------- | -------------- |
| • Conceptos                                | básicos   | del procesamiento |             | de imágenes.   |
| o Fundamentos de manipulación de imágenes  |           |                   |             |                |
digitales, Filtrado y bordes.
| o Fundamentos de transformaciones geométricas.  |     |     |     |     |
| ----------------------------------------------- | --- | --- | --- | --- |
| o Representaciones de imágenes, como escala de  |     |     |     |     |
grises, RGB, y entender cómo se almacenan y
procesan los píxeles.
5
Escuela de Tecnologías de la Información www.senati.edu.pe

| Presentación | del Proyecto | FInal |
| ------------ | ------------ | ----- |
6
Escuela de Tecnologías de la Información www.senati.edu.pe

Charla de 5 minutos
| Efectos | del fenómeno | del niño | Parte | 1   |
| ------- | ------------ | -------- | ----- | --- |
7
Escuela de Tecnologías de la Información

8
Escuela de Tecnologías de la Información

Nociones previas
9
Escuela de Tecnologías de la Información www.senati.edu.pe

Caso: Fallo Crítico en el Sistema de Alerta Temprana
La firma de seguridad privada SafeCity Tech ha desplegado 1,200 cámaras de videovigilancia IP de alta resolución (4K) en los puntos
de acceso de un centro financiero. El objetivo del sistema es detectar intrusos y realizar reconocimiento facial automatizado en tiempo
real comparando los rostros con una base de datos local. Sin embargo, el centro de control reporta un colapso en el sistema y un 85%
de falsas alarmas debido a tres problemas críticos reportados por los ingenieros de soporte:
1. El software de análisis intenta procesar el flujo de video a color de las 1,200 cámaras simultáneamente. Los servidores están al
100% de uso de CPU analizando gigabytes de datos de color (tonos de ropa, autos, letreros luminosos), lo que ralentiza el sistema
y causa un retraso (lag) que impide congelar el rostro de los sospechosos a tiempo.
2. Cuando una persona camina mirando de lado, o cuando la cámara está físicamente inclinada por el viento, el algoritmo de
comparación directa falla porque los ojos, la nariz y la boca cambian de posición en el plano de captura.
3. Durante el cambio de tarde a noche, los postes de luz y el sol generan sombras alargadas en el suelo y en las paredes. El sistema
activa alertas continuas de "intruso detectado" porque confunde el movimiento de una sombra proyectada en una pared con la
silueta física de una persona real.
¿Qué tareas de preprocesamiento de imágenes y/o configuración del modelo de red neuronal
deberíamos proponer para solucionar estos desafíos?
10
Escuela de Tecnologías de la Información www.senati.edu.pe

Caso: Fallo Crítico en el Sistema de Alerta Temprana
Desafío 1: Saturación de CPU y Retraso (Color vs. Rendimiento)
• Tarea de Preprocesamiento:
o Conversión inmediata de espacios de color a Escala de Grises para descartar datos cromáticos redundantes. Significa eliminar por
completo la información de los canales cromáticos (el color en sí mismo) y conservar únicamente la intensidad de la luz (brillo) de cada
punto de la imagen
• Optimización del Pipeline:
o Implementación de Reducción de Resolución (Resize) de la región de interés (ROI) para procesar matrices compactas y de bajo peso
en la memoria RAM del servidor. Significa recortar primero la zona específica del video donde se detectó el rostro (Región de Interés o
ROI) y luego disminuir la cantidad de filas y columnas (píxeles) de esa submatriz para hacerla más pequeña.
• Efecto:
o Reducción del 66.6% del volumen de datos en memoria, eliminando el lag del flujo en tiempo real. Al pasar de un objeto de tres
dimensiones (color) a una de dos dimensiones (gris) y reducir su tamaño físico, el peso del archivo en la memoria RAM se desploma
drásticamente.
11
Escuela de Tecnologías de la Información www.senati.edu.pe

Caso: Fallo Crítico en el Sistema de Alerta Temprana
Ángulos Irregulares e Inclinación (Variabilidad Geométrica)
• Tarea de Preprocesamiento: Transformaciones Geométricas Afines.
o Localización de puntos de referencia clave (como los ojos) para aplicar una Rotación Matricial. Significa
recalcular las coordenadas de cada elemento de la cuadrícula mediante un pivote central para girar la
imagen un ángulo específico, corrigiendo desviaciones espaciales.
• Normalización Espacial:
o Uso de Recorte (Crop) y escalado uniforme para forzar a que todos los rostros ingresen alineados
verticalmente y con dimensiones idénticas. Significa extraer con precisión matemática los límites del
objetivo detectado y redimensionar ese bloque para que cumpla con un tamaño estándar obligatorio
• Efecto:
o Garantiza que la red convolucional reciba entradas estandarizadas, mitigando la necesidad de que el
modelo aprenda invarianza rotacional extrema.
12
Escuela de Tecnologías de la Información www.senati.edu.pe

Caso: Fallo Crítico en el Sistema de Alerta Temprana
Falsos Positivos por Sombras (Ruido Ambiental)
• Tarea de Preprocesamiento:
o Aplicar la técnica del suavizado espacial para estabilizar la señal, seguido del cálculo de gradientes mediante Detección de Bordes.
Significa promediar matemáticamente los valores de los puntos vecinos para disolver las imperfecciones y variaciones bruscas de luz
que introduce el sensor de la cámara y el calculo de la gradiente significa medir la tasa de cambio numérico entre puntos contiguos
para identificar dónde ocurren cortes drásticos de luz en lugar de transiciones suaves.
• • Segmentación Avanzada:
o Aplicación de Umbralización Estricta para transformar la imagen continua en una matriz puramente binaria (0 y 255). Significa aplicar
una regla lógica de corte para clasificar los datos de la matriz en dos estados absolutos: presencia de contorno o fondo vacío,
eliminando los tonos intermedios.
• • Efecto:
o Las variaciones numéricas lentas de las sombras desaparecen por el umbral y el gradiente bajo, aislando exclusivamente las líneas de
contorno físicas de los intrusos reales.
13
Escuela de Tecnologías de la Información www.senati.edu.pe

Desarrollo
14
Escuela de Tecnologías de la Información www.senati.edu.pe

Representación de Imágenes
•
Píxel: Unidad mínima de color en una imagen digital.
•
Imágenes en Escala de Grises: Matriz 2D de dimensiones (Alto x Ancho) con valores entre 0
y 255.
•
Imágenes en Color (RGB / BGR): Matriz 3D de dimensiones (Alto x Ancho x Canales).
•
RGB: Es el estándar universal en desarrollo web, pantallas y la librería PIL de Python.
•
BGR: Es el orden inverso (Azul, Verde, Rojo) que utiliza por defecto la popular librería de
visión artificial OpenCV por razones históricas de diseño.
15
Escuela de Tecnologías de la Información www.senati.edu.pe

Representación de Imágenes
16
Escuela de Tecnologías de la Información www.senati.edu.pe

Representación de Imágenes
Una imagen a color de 640 x 480 en BGR es una matriz tensor de forma (480,
640, 3). Convertir a escala de grises combina los tres canales mediante la
ponderación luminosa: Y = 0.299R + 0.587G + 0.114B, reduciendo la matriz a
(480, 640).
17
Escuela de Tecnologías de la Información www.senati.edu.pe

Librería OpenCV (cv2):
OpenCV (Open Source Computer Vision Library) es la biblioteca de código abierto más popular del mundo para visión
artificial, procesamiento de imágenes y aprendizaje automático. En Python se importa bajo el nombre de cv2 y actúa como
un motor clave para desarrollar software capaz de identificar objetos, reconocer rostros, rastrear movimientos y procesar
secuencias de video en tiempo real.
18
Escuela de Tecnologías de la Información www.senati.edu.pe

Librería OpenCV (cv2):
https://colab.research.google.com/drive/165T7G9naBqNRhq3iN4XuQ4O8y6qYeMNB?usp=sharing
19
Escuela de Tecnologías de la Información www.senati.edu.pe

Conversión de Espacios de Color y Extracción de canales
• Transformación de Espacios: Uso de cv2.cvtColor() para migrar dinámicamente
entre representaciones de color.
• Aislamiento de Información: Métodos cv2.split() y cv2.merge() para descomponer
y reconstruir los canales del sensor.
• Invarianza al Color: Para las redes neuronales y algoritmos de geometría facial, el
color de la luz es ruido. La escala de grises estandariza la entrada del pipeline.
20
Escuela de Tecnologías de la Información www.senati.edu.pe

Conversión de Espacios de Color y Extracción de canales
21
Escuela de Tecnologías de la Información www.senati.edu.pe

Conversión de Espacios de Color y Extracción de canales
https://colab.research.google.com/drive/1UympkjJi_QLV1aPFCaWxXuqGtQADoLZb?usp=sharing
22
Escuela de Tecnologías de la Información www.senati.edu.pe

Filtrado Espacial y Eliminación de Ruido de Alta Frecuencia
• Convolución Espacial: Operación donde una matriz pequeña (Kernel) se desliza sobre la
imagen para recalcular el valor de cada píxel basándose en su vecindad.
• Filtro Gaussiano (cv2.GaussianBlur): Suavizado matemático diseñado para eliminar el grano
electrónico de la cámara web o variaciones de luz térmicas.
• Efecto en la Imagen: Actúa como un filtro de paso bajo que difumina imperfecciones menores
sin deformar las estructuras críticas del rostro u objeto.
23
Escuela de Tecnologías de la Información www.senati.edu.pe

Filtrado Espacial y Eliminación de Ruido de Alta Frecuencia
24
Escuela de Tecnologías de la Información www.senati.edu.pe

Filtrado Espacial y Eliminación de Ruido de Alta Frecuencia
25
Escuela de Tecnologías de la Información www.senati.edu.pe

Detección de Bordes y Análisis de Gradientes
• Bordes Biológicos vs Sombras: Los bordes reales son discontinuidades abruptas en la matriz
de gris; las sombras ambientales cambian suavemente.
• Operador Sobel (cv2.Sobel): Aproxima las derivadas parciales de la intensidad de la imagen
para calcular los gradientes horizontales.
• Algoritmo Canny (cv2.Canny): Pipeline optimizado de 4 etapas: Suavizado → Cálculo de
magnitud de gradiente → Supresión de no máximos → Umbralización por histéresis.
https://colab.research.google.com/drive/1aYeXxfp79GgXN7lUNJVcJqKaqIm61lGC?usp=sharing
26
Escuela de Tecnologías de la Información www.senati.edu.pe

Filtrado Espacial y Eliminación de Ruido de Alta Frecuencia
27
Escuela de Tecnologías de la Información www.senati.edu.pe

Filtrado Espacial y Eliminación de Ruido de Alta Frecuencia
28
Escuela de Tecnologías de la Información www.senati.edu.pe

Álgebra de Transformaciones Geométricas (Alineación Facial)
• Corrección de Ángulos (Transformaciones Afines): Operaciones lineales sobre matrices que
preservan las líneas paralelas.
• Escalado (cv2.resize): Normalización de la resolución espacial mediante interpolación de
píxeles (INTER_AREA para reducción).
• Rotación (cv2.getRotationMatrix2D + cv2.warpAffine): Multiplicación de las coordenadas (x, y)
por una matriz de transformación afín M para contrarrestar la inclinación física de la cámara.
• Recorte (Crop): Selección de la Región de Interés (ROI) utilizando indexación directa de
NumPy para aislar únicamente el rostro.
https://colab.research.google.com/drive/1K-5TI62ZbcYKuWegIsa-v_F_WWIrm6iV?usp=sharing
29
Escuela de Tecnologías de la Información www.senati.edu.pe

Álgebra de Transformaciones Geométricas (Alineación Facial)
30
Escuela de Tecnologías de la Información www.senati.edu.pe

Álgebra de Transformaciones Geométricas (Alineación Facial)
31
Escuela de Tecnologías de la Información www.senati.edu.pe

Binarización y Umbralización Estricta (Thresholding)
• Segmentación por Umbralización (cv2.threshold): Técnica de separación de datos que
transforma una matriz en escala de grises en una imagen puramente binaria estructurada en
dos estados numéricos absolutos: \(0\) (Fondo) y \(255\) (Objeto de interés).
• Estrategia de Selección Absoluta:
o THRESH_BINARY: Si el valor del píxel supera el umbral establecido, se transforma a
255; de lo contrario, se asigna a 0.
o THRESH_BINARY_INV: Invierte la regla. Los píxeles que superan el umbral pasan a ser
0, y los inferiores se convierten en 255. (Ideal para aislar trazos oscuros o texto sobre
fondos claros).
32
Escuela de Tecnologías de la Información www.senati.edu.pe

Binarización y Umbralización Estricta (Thresholding)
33
Escuela de Tecnologías de la Información www.senati.edu.pe

Binarización y Umbralización Estricta (Thresholding)
34
Escuela de Tecnologías de la Información www.senati.edu.pe

Ejemplo
https://colab.research.google.com/drive/1YFRJp6jRn2YJQalRb6q2bqg08-EV2tCG?usp=sharing
35
Escuela de Tecnologías de la Información www.senati.edu.pe

¡¡GRACIAS!!
36
Escuela de Tecnologías de la Información www.senati.edu.pe