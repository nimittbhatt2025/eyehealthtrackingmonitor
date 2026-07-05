#!/bin/bash

# EyeVio Setup Script
# This script sets up the EyeVio backend application

set -e  # Exit on error

echo "🌟 EyeVio Backend Setup"
echo "======================="
echo ""

# Check Python version
echo "📋 Checking Python version..."
python_version=$(python3 --version 2>&1 | awk '{print $2}')
echo "Python version: $python_version"

# Check if PostgreSQL is installed
echo ""
echo "📋 Checking PostgreSQL..."
if command -v psql &> /dev/null; then
    echo "✅ PostgreSQL is installed"
    psql_version=$(psql --version | awk '{print $3}')
    echo "PostgreSQL version: $psql_version"
else
    echo "❌ PostgreSQL is not installed"
    echo "Please install PostgreSQL: brew install postgresql@14"
    exit 1
fi

# Create virtual environment
echo ""
echo "🔧 Creating virtual environment..."
if [ ! -d "venv" ]; then
    python3 -m venv venv
    echo "✅ Virtual environment created"
else
    echo "ℹ️  Virtual environment already exists"
fi

# Activate virtual environment
echo ""
echo "🔧 Activating virtual environment..."
source venv/bin/activate

# Upgrade pip
echo ""
echo "🔧 Upgrading pip..."
pip install --upgrade pip

# Install dependencies
echo ""
echo "📦 Installing dependencies..."
echo "This may take several minutes..."
pip install -r requirements.txt

# Create .env file if it doesn't exist
echo ""
echo "⚙️  Setting up environment variables..."
if [ ! -f ".env" ]; then
    cp .env.example .env
    echo "✅ Created .env file from .env.example"
    echo "⚠️  Please edit .env and update the following:"
    echo "   - DATABASE_URL (PostgreSQL connection string)"
    echo "   - SECRET_KEY (generate a random string)"
    echo "   - JWT_SECRET_KEY (generate a random string)"
else
    echo "ℹ️  .env file already exists"
fi

# Create database
echo ""
echo "🗄️  Setting up database..."
read -p "Do you want to create the database 'eyevio_db'? (y/n) " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
    if psql -lqt | cut -d \| -f 1 | grep -qw eyevio_db; then
        echo "ℹ️  Database 'eyevio_db' already exists"
    else
        createdb eyevio_db || psql -c "CREATE DATABASE eyevio_db;"
        echo "✅ Database 'eyevio_db' created"
    fi
else
    echo "⏭️  Skipping database creation"
fi

# Initialize Flask-Migrate
echo ""
echo "🔧 Initializing database migrations..."
if [ ! -d "migrations" ]; then
    export FLASK_APP=run.py
    flask db init
    echo "✅ Migrations initialized"
else
    echo "ℹ️  Migrations already initialized"
fi

# Create initial migration
echo ""
read -p "Do you want to create and apply database migrations? (y/n) " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
    export FLASK_APP=run.py
    flask db migrate -m "Initial migration"
    flask db upgrade
    echo "✅ Database migrations applied"
else
    echo "⏭️  Skipping migrations"
fi

# Create necessary directories
echo ""
echo "📁 Creating necessary directories..."
mkdir -p uploads
mkdir -p app/ai_models/trained_models
mkdir -p logs
echo "✅ Directories created"

# Print completion message
echo ""
echo "✅ Setup complete!"
echo ""
echo "📝 Next steps:"
echo "1. Edit .env file with your configuration"
echo "2. Update DATABASE_URL in .env"
echo "3. Run the application:"
echo "   python run.py"
echo ""
echo "🌐 The API will be available at: http://localhost:5000"
echo "📖 Check /health endpoint to verify: curl http://localhost:5000/health"
echo ""
echo "📚 Documentation:"
echo "   - API endpoints: See README.md"
echo "   - Database schema: See app/models/__init__.py"
echo ""
echo "Happy coding! 🚀"
