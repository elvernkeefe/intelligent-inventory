"""
ML Model loader and prediction interface
Loads the trained CatBoost model, scaler, and feature names from pickle files
"""
import pickle
import json
import os
import numpy as np
import pandas as pd
from typing import Dict, List, Any

# Get base directory (project root)
BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


class InventoryPredictor:
    """
    Wrapper class for the trained inventory prediction model.
    Handles model loading, feature engineering, and predictions.
    """
    
    def __init__(self):
        self.model = None
        self.scaler = None
        self.feature_names = None
        self.metadata = None
        self.is_loaded = False
        
    def load_model(self):
        """Load model, scaler, feature names, and metadata from pickle files"""
        try:
            # Load trained model
            model_path = os.path.join(BASE_DIR, "optimized_catboost_model.pkl")
            with open(model_path, 'rb') as f:
                self.model = pickle.load(f)
            print(f"✅ Model loaded from: {model_path}")
            
            # Load feature scaler
            scaler_path = os.path.join(BASE_DIR, "feature_scaler.pkl")
            with open(scaler_path, 'rb') as f:
                self.scaler = pickle.load(f)
            print(f"✅ Scaler loaded from: {scaler_path}")
            
            # Load feature names
            features_path = os.path.join(BASE_DIR, "feature_names.pkl")
            with open(features_path, 'rb') as f:
                self.feature_names = pickle.load(f)
            print(f"✅ Feature names loaded: {len(self.feature_names)} features")
            
            # Load metadata
            metadata_path = os.path.join(BASE_DIR, "model_metadata.json")
            with open(metadata_path, 'r') as f:
                self.metadata = json.load(f)
            print(f"✅ Metadata loaded: {self.metadata['model_type']}")
            print(f"   Model Performance: R²={self.metadata['test_r2']:.4f}, MAE={self.metadata['test_mae']:.2f}")
            
            self.is_loaded = True
            return True
            
        except Exception as e:
            print(f"❌ Error loading model: {str(e)}")
            return False
    
    def predict(self, features_df: pd.DataFrame) -> Dict[str, Any]:
        """
        Make prediction for a single store-category combination
        
        Args:
            features_df: DataFrame with engineered features (already processed)
        
        Returns:
            Dictionary with prediction, confidence, and intervals
        """
        if not self.is_loaded:
            raise ValueError("Model not loaded. Call load_model() first.")
        
        # Scale ALL features first (scaler was trained on all features)
        # Ensure columns are in the same order as during training
        if hasattr(self.scaler, 'feature_names_in_'):
            expected_order = self.scaler.feature_names_in_.tolist()
            # Reorder columns to match scaler's expected order
            missing_cols = [col for col in expected_order if col not in features_df.columns]
            if missing_cols:
                raise ValueError(f"Missing columns for scaling: {missing_cols}")
            features_df = features_df[expected_order]
        
        X_scaled = features_df.copy()
        numeric_cols = X_scaled.select_dtypes(include=[np.number]).columns
        X_scaled[numeric_cols] = self.scaler.transform(X_scaled[numeric_cols])
        
        # Then select only the features needed by the model
        if not all(feat in X_scaled.columns for feat in self.feature_names):
            missing = [f for f in self.feature_names if f not in X_scaled.columns]
            raise ValueError(f"Missing features: {missing}")
        
        X = X_scaled[self.feature_names]
        
        # Make prediction
        prediction = float(self.model.predict(X)[0])
        
        # Calculate confidence intervals using RMSE
        rmse = self.metadata['test_rmse']
        r2 = self.metadata['test_r2']
        
        return {
            'predicted_order_quantity': max(0, round(prediction)),  # Can't order negative
            'confidence_score': round(r2, 4),
            'prediction_interval_lower': max(0, round(prediction - rmse)),
            'prediction_interval_upper': round(prediction + rmse),
            'model_version': self.metadata['model_type'],
            'model_mae': self.metadata['test_mae'],
            'model_rmse': rmse
        }
    
    def predict_batch(self, features_df: pd.DataFrame) -> List[Dict[str, Any]]:
        """
        Make predictions for multiple store-category combinations
        
        Args:
            features_df: DataFrame with multiple rows of engineered features
        
        Returns:
            List of prediction dictionaries
        """
        if not self.is_loaded:
            raise ValueError("Model not loaded. Call load_model() first.")
        
        # Ensure features match training
        X = features_df[self.feature_names].copy()
        
        # Scale features
        numeric_cols = X.select_dtypes(include=[np.number]).columns
        X[numeric_cols] = self.scaler.transform(X[numeric_cols])
        
        # Make predictions
        predictions = self.model.predict(X)
        
        # Format results
        rmse = self.metadata['test_rmse']
        r2 = self.metadata['test_r2']
        
        results = []
        for pred in predictions:
            results.append({
                'predicted_order_quantity': max(0, round(float(pred))),
                'confidence_score': round(r2, 4),
                'prediction_interval_lower': max(0, round(float(pred) - rmse)),
                'prediction_interval_upper': round(float(pred) + rmse),
            })
        
        return results
    
    def get_feature_importance(self, top_n: int = 20) -> List[Dict[str, Any]]:
        """Get feature importance from the model"""
        if not self.is_loaded:
            raise ValueError("Model not loaded. Call load_model() first.")
        
        if hasattr(self.model, 'feature_importances_'):
            importances = self.model.feature_importances_
            feature_importance = [
                {'feature': feat, 'importance': float(imp)}
                for feat, imp in zip(self.feature_names, importances)
            ]
            # Sort by importance
            feature_importance.sort(key=lambda x: x['importance'], reverse=True)
            return feature_importance[:top_n]
        else:
            return []


# Global predictor instance (singleton)
predictor = InventoryPredictor()
