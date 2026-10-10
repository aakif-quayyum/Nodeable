import Button from '@mui/material/Button'
import Typography from '@mui/material/Typography'
import { Link } from 'react-router'

export function NotFoundPage() {
  return (
    <>
      <Typography variant="h1" gutterBottom>
        Page not found
      </Typography>
      <Typography color="text.secondary" sx={{ mb: 2 }}>
        That address does not match anything in Nodeable.
      </Typography>
      <Button variant="contained" component={Link} to="/">
        Back to home
      </Button>
    </>
  )
}
