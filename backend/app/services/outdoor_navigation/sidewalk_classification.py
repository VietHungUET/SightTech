import os
os.environ['TF_CPP_MIN_LOG_LEVEL'] = '2'  # Ẩn TensorFlow warnings

import cv2
import tensorflow as tf
import numpy as np
import h5py
from app.services.outdoor_navigation.utils.circularBuffer import CircularBuffer

# Tắt các deprecation warnings
tf.compat.v1.logging.set_verbosity(tf.compat.v1.logging.ERROR)

CLASSES = ['Left of Sidewalk', 'Middle of Sidewalk', 'Right of Sidewalk', 'Nothing Detected']
MODEL_PATH = r"app/models/sidewalk_classification_model_vgg16_final.h5"
READINGS_BUFFER_SIZE = 20  # Reduced for faster response
IMAGE_SIZE = (100, 100)
DETECTION_THRESHOLD = 0.5


class SidewalkClassification:

    def __init__(self, model_path=MODEL_PATH, buffer_size=READINGS_BUFFER_SIZE):
        print("[Sidewalk] Loading model...")
        self.model = self.build_sidewalk_model()
        self.load_custom_dense(self.model, model_path)
        print("[Sidewalk] Model ready")

        self.readings_buffer = CircularBuffer(buffer_size, noneOverridePercent=0.5)
        self.last_result = None


    # ============================================================
    # 1) Build VGG16 backbone + custom head (same as training)
    # ============================================================
    def build_sidewalk_model(self):
        base = tf.keras.applications.VGG16(
            include_top=False,
            weights="imagenet",
            input_shape=(100, 100, 3)
        )

        x = base.output
        x = tf.keras.layers.GlobalAveragePooling2D(name="global_average_pooling2d")(x)
        out = tf.keras.layers.Dense(3, activation="softmax", name="dense")(x)

        model = tf.keras.Model(inputs=base.input, outputs=out)
        # Don't compile to speed up loading
        return model


    # ============================================================
    # 2) Load custom dense layer weights from H5 file
    # ============================================================
        
    def load_custom_dense(self, model, weight_path):
        with h5py.File(weight_path, "r") as f:
            mw = f["model_weights"]

            # ============
            # 1. Load VGG16 backbone
            # ============
            vgg_group = mw["vgg16"]

            for layer in model.layers:
                name = layer.name
                if name in vgg_group:
                    g = vgg_group[name]
                    weights = []
                    for w in layer.weights:
                        w_name = w.name.split("/")[-1]
                        if w_name in g:
                            weights.append(g[w_name][()])
                    if weights:
                        layer.set_weights(weights)

            # ============
            # 2. Load GAP layer
            # ============
            # GAP layer has no weights → skip

            # 3. Load Dense layer
            # ============
            dense_group = mw["dense"]["dense"]
            kernel = dense_group["kernel:0"][:]
            bias = dense_group["bias:0"][:]
            model.get_layer("dense").set_weights([kernel, bias])


    # ============================================================
    # 3) Preprocess frame
    # ============================================================
    def preprocess_frame(self, frame):
        """Preprocess frame for model inference"""
        if frame is None:
            return None
        frame = cv2.resize(frame, IMAGE_SIZE, interpolation=cv2.INTER_LINEAR)
        frame = np.expand_dims(frame, 0)  # shape (1,100,100,3)
        return frame


    # ============================================================
    # 4) Perform inference + smoothing
    # ============================================================
    def predict(self, frame):
        """Predict sidewalk position from frame"""
        processed = self.preprocess_frame(frame)
        if processed is None:
            return self.last_result

        preds = self.model.predict(processed, verbose=0)[0]

        # Nếu max prob < threshold → treat as None
        self.readings_buffer.add(
            None if max(preds) < DETECTION_THRESHOLD else preds
        )

        averaged = self.readings_buffer.mean()

        if averaged is None:
            self.last_result = CLASSES[-1]   # Nothing detected
        else:
            idx = np.argmax(averaged)
            self.last_result = CLASSES[idx]

        return self.last_result


    # ============================================================
    # 5) Get last inference result
    # ============================================================
    def get_last_result(self):
        """Get last prediction result"""
        return self.last_result

