import {NavLink} from "react-router-dom";

export default function MenuBar() {
    return (
        <nav style={{ display: 'flex', gap: '1rem', marginBottom: '1rem' }}>
            <NavLink to="/">Home</NavLink>
            <NavLink to="/object">Object</NavLink>
        </nav>
    )
}