import cv2
import os
import base64
from typing import List, Tuple
from PIL import Image
import io


class VideoProcessor:
    """動画・画像処理クラス"""

    def __init__(self, max_frames: int = 10, target_size: Tuple[int, int] = (1280, 720)):
        self.max_frames = max_frames
        self.target_size = target_size

    def extract_frames(self, video_path: str) -> List[str]:
        """
        動画からキーフレームを抽出し、Base64エンコードされた画像リストを返す
        """
        cap = cv2.VideoCapture(video_path)

        if not cap.isOpened():
            raise ValueError(f"動画ファイルを開けません: {video_path}")

        total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
        fps = cap.get(cv2.CAP_PROP_FPS)
        duration = total_frames / fps if fps > 0 else 0

        # 等間隔でフレームを抽出
        frame_indices = self._calculate_frame_indices(total_frames)

        frames_base64 = []

        for idx in frame_indices:
            cap.set(cv2.CAP_PROP_POS_FRAMES, idx)
            ret, frame = cap.read()

            if ret:
                # リサイズ
                frame = self._resize_frame(frame)
                # Base64エンコード
                base64_str = self._frame_to_base64(frame)
                frames_base64.append(base64_str)

        cap.release()

        return frames_base64

    def process_image(self, image_path: str) -> str:
        """
        画像を処理し、Base64エンコードされた文字列を返す
        """
        img = cv2.imread(image_path)

        if img is None:
            raise ValueError(f"画像ファイルを開けません: {image_path}")

        # リサイズ
        img = self._resize_frame(img)

        return self._frame_to_base64(img)

    def _calculate_frame_indices(self, total_frames: int) -> List[int]:
        """等間隔でフレームインデックスを計算"""
        if total_frames <= self.max_frames:
            return list(range(total_frames))

        step = total_frames / self.max_frames
        return [int(i * step) for i in range(self.max_frames)]

    def _resize_frame(self, frame) -> any:
        """フレームをターゲットサイズにリサイズ"""
        h, w = frame.shape[:2]
        target_w, target_h = self.target_size

        # アスペクト比を維持してリサイズ
        scale = min(target_w / w, target_h / h)

        if scale < 1:
            new_w = int(w * scale)
            new_h = int(h * scale)
            frame = cv2.resize(frame, (new_w, new_h), interpolation=cv2.INTER_AREA)

        return frame

    def _frame_to_base64(self, frame) -> str:
        """フレームをBase64文字列に変換"""
        # BGR to RGB
        frame_rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)

        # PIL Imageに変換
        pil_image = Image.fromarray(frame_rgb)

        # JPEG形式でエンコード
        buffer = io.BytesIO()
        pil_image.save(buffer, format="JPEG", quality=85)
        buffer.seek(0)

        # Base64エンコード
        return base64.b64encode(buffer.getvalue()).decode("utf-8")

    def is_video(self, file_path: str) -> bool:
        """ファイルが動画かどうかを判定"""
        video_extensions = {'.mp4', '.mov', '.avi', '.mkv', '.webm'}
        ext = os.path.splitext(file_path)[1].lower()
        return ext in video_extensions

    def is_image(self, file_path: str) -> bool:
        """ファイルが画像かどうかを判定"""
        image_extensions = {'.jpg', '.jpeg', '.png', '.gif', '.bmp', '.webp'}
        ext = os.path.splitext(file_path)[1].lower()
        return ext in image_extensions
