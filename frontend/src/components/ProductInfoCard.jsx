import PropTypes from "prop-types";
import React from "react";
import "./ProductInfoCard.css";

const UNKNOWN_VALUE = "Unknown";

function isMeaningful(value) {
    if (!value) return false;
    if (typeof value === "string" && value.trim().toLowerCase() === UNKNOWN_VALUE.toLowerCase()) {
        return false;
    }
    return true;
}

function renderNutrition(nutrition) {
    if (!nutrition || typeof nutrition !== "object") {
        return null;
    }

    const entries = Object.entries(nutrition).filter(([, value]) => isMeaningful(value));
    if (!entries.length) {
        return null;
    }

    return (
        <dl className="product-info-nutrition">
            {entries.map(([key, value]) => (
                <React.Fragment key={key}>
                    <dt>{key.replace(/_/g, " ")}</dt>
                    <dd>{value}</dd>
                </React.Fragment>
            ))}
        </dl>
    );
}

function renderMeta(label, value) {
    if (!isMeaningful(value)) {
        return null;
    }
    return (
        <p className="product-info-meta">
            <span className="product-info-label">{label}:</span> {value}
        </p>
    );
}

export default function ProductInfoCard({ product }) {
    if (!product) {
        return null;
    }

    const {
        name,
        brand,
        category,
        type,
        quantity,
        description,
        ingredients,
        allergens,
        nutrition,
        labels,
        nutri_score: nutriScore,
        image_url: imageUrl,
    } = product;

    return (
        <section className="product-info-card" aria-live="polite">
            {isMeaningful(imageUrl) && (
                <img
                    src={imageUrl}
                    alt={isMeaningful(name) ? `${name} product photo` : "Product illustration"}
                    className="product-info-image"
                />
            )}
            <div className="product-info-content">
                {isMeaningful(name) && <h2>{name}</h2>}
                {renderMeta("Brand", brand)}
                {renderMeta("Type", type)}
                {renderMeta("Category", category)}
                {renderMeta("Quantity", quantity)}
                {renderMeta("Nutri-Score", nutriScore ? nutriScore.toUpperCase() : null)}
                {renderMeta("Labels", labels)}
                {isMeaningful(description) && (
                    <p className="product-info-description">{description}</p>
                )}
                {isMeaningful(ingredients) && (
                    <p className="product-info-meta">
                        <span className="product-info-label">Ingredients:</span> {ingredients}
                    </p>
                )}
                {isMeaningful(allergens) && (
                    <p className="product-info-meta">
                        <span className="product-info-label">Allergens:</span> {allergens}
                    </p>
                )}
                {renderNutrition(nutrition)}
            </div>
        </section>
    );
}

ProductInfoCard.propTypes = {
    product: PropTypes.shape({
        name: PropTypes.string,
        brand: PropTypes.string,
        category: PropTypes.string,
        type: PropTypes.string,
        quantity: PropTypes.string,
        description: PropTypes.string,
        ingredients: PropTypes.string,
        allergens: PropTypes.string,
        nutrition: PropTypes.object,
        labels: PropTypes.string,
        nutri_score: PropTypes.string,
        image_url: PropTypes.string,
    }),
};
