module.exports = {
        transformVector : function(inVector,inMatrix) {
            
            if(!inMatrix)
                return inVector;
            
            var fX;
            var fY;
            
            fX = inMatrix[0]*inVector[0] + inMatrix[2]*inVector[1] + inMatrix[4];
            fY = inMatrix[1]*inVector[0] + inMatrix[3]*inVector[1] + inMatrix[5];
        
            return [fX,fY];
        },
        
        inverseMatrix: function(inMatrix)
        {
            if(!inMatrix)
                return inMatrix;
            
            var a = inMatrix[0];
            var b = inMatrix[1];
            var c = inMatrix[2];
            var d = inMatrix[3];
            var t1 = inMatrix[4];
            var t2 = inMatrix[5];
            var det = a*d-b*c;
            
            return [
              d/det,
              -b/det,
              -c/det,
              a/det,
              (c*t2-d*t1)/det,
              (b*t1-a*t2)/det
            ];
            
        },
        
        determinante : function(inMatrix)
        {
            if(!inMatrix)
                return 1;
            return inMatrix[0]*inMatrix[3]-inMatrix[1]*inMatrix[2];
        },
        
        multiplyMatrix: function(inMatrixA,inMatrixB)
        {
            if(!inMatrixA)
                return inMatrixB;
            if(!inMatrixB)
                return inMatrixA;
            
            return [
                inMatrixA[0]*inMatrixB[0] + inMatrixA[1]*inMatrixB[2],
                inMatrixA[0]*inMatrixB[1] + inMatrixA[1]*inMatrixB[3],
                inMatrixA[2]*inMatrixB[0] + inMatrixA[3]*inMatrixB[2],
                inMatrixA[2]*inMatrixB[1] + inMatrixA[3]*inMatrixB[3],
                inMatrixA[4]*inMatrixB[0] + inMatrixA[5]*inMatrixB[2] + inMatrixB[4],
                inMatrixA[4]*inMatrixB[1] + inMatrixA[5]*inMatrixB[3] + inMatrixB[5],
                ];
        },
        
        transformBox: function(inBox,inMatrix)
        {
            if(!inMatrix)
                return inBox;
            
            var t = new Array(4);
            t[0] = this.transformVector([inBox[0],inBox[1]],inMatrix);
            t[1] = this.transformVector([inBox[0],inBox[3]],inMatrix);
            t[2] = this.transformVector([inBox[2],inBox[3]],inMatrix);
            t[3] = this.transformVector([inBox[2],inBox[1]],inMatrix);
            
            var minX,minY,maxX,maxY;
            
            minX = maxX = t[0][0];
            minY = maxY = t[0][1];
            
            for(var i=1;i<4;++i)
            {
                if(minX > t[i][0])
                    minX = t[i][0];
                if(maxX < t[i][0])
                    maxX = t[i][0];
                if(minY > t[i][1])
                    minY = t[i][1];
                if(maxY < t[i][1])
                    maxY = t[i][1];
            }
            
            return [minX,minY,maxX,maxY];
        }
        
    };
    